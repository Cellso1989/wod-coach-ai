/**
 * Thin OpenAI API wrapper. Agent-specific prompts and Zod validation of AI
 * output live in @wod-coach-ai/coach-engine.
 */

export interface AiMessageContentPart {
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface SendMessageParams {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: Array<{ role: 'user'; content: AiMessageContentPart[] }>;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface AiTextMessage {
  text: string;
}

class OpenAiApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function normalizeReasoningEffort(
  effort: SendMessageParams['effort'],
): 'minimal' | 'low' | 'medium' | 'high' {
  if (effort === 'xhigh' || effort === 'max') return 'high';
  return effort;
}

function toOpenAiContent(content: AiMessageContentPart[]) {
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'input_text', text: part.text ?? '' };
    }

    if (!part.imageBase64 || !part.imageMimeType) {
      throw new Error('Imagem enviada para IA sem base64 ou mime type');
    }

    return {
      type: 'input_image',
      image_url: `data:${part.imageMimeType};base64,${part.imageBase64}`,
    };
  });
}

function extractOutputText(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';

  const maybeOutputText = (body as { output_text?: unknown }).output_text;
  if (typeof maybeOutputText === 'string') return maybeOutputText;

  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';

  return output
    .flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => {
      if (typeof part !== 'object' || part === null) return '';
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .join('');
}

export function createOpenAiMessageSender(
  apiKey: string = process.env.OPENAI_API_KEY ?? '',
): (params: SendMessageParams) => Promise<AiTextMessage> {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  return async (params) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? params.model,
        instructions: params.systemPrompt,
        input: params.messages.map((message) => ({
          role: message.role,
          content: [
            ...toOpenAiContent(message.content),
            { type: 'input_text', text: 'Return JSON only.' },
          ],
        })),
        max_output_tokens: params.maxTokens,
        reasoning: { effort: normalizeReasoningEffort(params.effort) },
        text: { format: { type: 'json_object' } },
      }),
    });

    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const error =
        typeof body === 'object' &&
        body !== null &&
        typeof (body as { error?: unknown }).error === 'object'
          ? (body as { error: { message?: unknown; code?: unknown } }).error
          : null;
      const message = typeof error?.message === 'string' ? error.message : response.statusText;
      const code = typeof error?.code === 'string' ? error.code : undefined;
      throw new OpenAiApiError(response.status, message, code);
    }

    return { text: extractOutputText(body) };
  };
}

/**
 * Traduz um erro vindo da OpenAI numa mensagem amigavel em PT-BR para mostrar
 * no app, em vez de deixar a rota devolver um 500 generico sem explicacao.
 * Retorna null se `err` nao for um erro da OpenAI.
 */
export function describeOpenAiApiError(err: unknown): { status: number; message: string } | null {
  if (!(err instanceof OpenAiApiError)) {
    return null;
  }

  if (err.status === 401 || err.status === 403) {
    return { status: 503, message: 'A chave da API de IA e invalida ou expirou' };
  }

  if (err.status === 429) {
    return {
      status: 429,
      message: 'Limite de uso da IA atingido no momento - tente novamente em alguns minutos',
    };
  }

  if (
    /billing|credit|quota|insufficient/i.test(err.message) ||
    /billing|quota/i.test(err.code ?? '')
  ) {
    return {
      status: 503,
      message:
        'O saldo ou limite da conta de IA acabou - ajuste a cobranca/limites da OpenAI para continuar',
    };
  }

  return {
    status: err.status >= 400 && err.status < 500 ? 502 : err.status,
    message: 'A IA esta indisponivel no momento. Tente novamente em instantes',
  };
}
