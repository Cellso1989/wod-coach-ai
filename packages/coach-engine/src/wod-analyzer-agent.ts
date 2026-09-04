import type Anthropic from "@anthropic-ai/sdk";
import { wodAnalysisOutputSchema, type WodAnalysisOutput } from "@wod-coach-ai/validation";
import { WOD_FORMATS, MOVEMENT_CATEGORIES } from "@wod-coach-ai/types";
import { callAiForJson, AiJsonError, type SendMessage } from "./ai-json-agent.js";

export type { SendMessage } from "./ai-json-agent.js";

export interface WodAnalyzerInput {
  rawText?: string | null;
  imageBase64?: string | null;
  imageMimeType?: string | null;
}

export class WodAnalysisError extends AiJsonError {}

const SYSTEM_PROMPT = `Você é o WodAnalyzerAgent do WOD Coach AI, um especialista em CrossFit.

Sua única tarefa é interpretar um WOD (treino de CrossFit) recebido como texto e/ou foto,
e devolver EXCLUSIVAMENTE um JSON válido — sem markdown, sem crases, sem texto antes ou depois —
com este formato exato:

{
  "format": ${JSON.stringify(WOD_FORMATS)} ou null,
  "durationMinutes": number ou null,
  "stimulus": string curto (ex: "mixed_modal", "heavy strength") ou null,
  "movements": [
    {
      "name": string,
      "category": ${JSON.stringify(MOVEMENT_CATEGORIES)},
      "reps": number ou null,
      "distanceMeters": number ou null,
      "loadDescription": string ou null (ex: "60/40kg", "75% do 1RM"),
      "calories": number ou null
    }
  ],
  "estimatedDemand": {
    "engine": 1-10,
    "grip": 1-10,
    "legs": 1-10,
    "gymnastics": 1-10,
    "technical": 1-10
  },
  "estimatedIntensity": 1-10 ou null,
  "confidence": 0-1,
  "warnings": [string]
}

Regras críticas:
- Seja OBJETIVO E CONCISO. O atleta lê isso no celular, no meio do treino. "stimulus"
  deve ser uma expressão curta (2-4 palavras, ex: "engine + grip", "força pesada"), e
  cada item de "warnings" deve ser uma frase curta e direta, sem explicações longas.
- Trate SOMENTE de CrossFit: AMRAP, EMOM, E2MOM, For Time, Chipper, Rounds For Time,
  Strength, Weightlifting, Gymnastics, Conditioning, Monostructural, Benchmark/Hero WODs.
- NUNCA invente números que não conseguir inferir do treino (seção 38). Se não souber,
  use null e explique a limitação em "warnings".
- "confidence" deve refletir sua real certeza — baixa se o texto/imagem for ambíguo,
  incompleto ou difícil de ler.
- Se receber uma imagem, leia o quadro/tela com atenção antes de responder.
- Responda APENAS com o JSON. Nenhum outro texto.`;

function buildUserContent(input: WodAnalyzerInput): Anthropic.MessageParam["content"] {
  const content: Anthropic.MessageParam["content"] = [];

  if (input.imageBase64 && input.imageMimeType) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.imageMimeType as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "image/gif",
        data: input.imageBase64,
      },
    });
  }

  content.push({
    type: "text",
    text: input.rawText?.trim()
      ? `Treino recebido (texto):\n\n${input.rawText.trim()}`
      : "Treino recebido apenas como imagem (ver acima).",
  });

  return content;
}

export interface AnalyzeWodOptions {
  maxAttempts?: number;
}

/**
 * WodAnalyzerAgent — pergunta "o que existe neste treino?" (seção 36).
 */
export async function analyzeWod(
  input: WodAnalyzerInput,
  sendMessage: SendMessage,
  options: AnalyzeWodOptions = {},
): Promise<WodAnalysisOutput> {
  if (!input.rawText?.trim() && !input.imageBase64) {
    throw new WodAnalysisError("Nenhum texto ou imagem de WOD fornecido para análise");
  }

  try {
    return await callAiForJson({
      schema: wodAnalysisOutputSchema,
      systemPrompt: SYSTEM_PROMPT,
      userContent: buildUserContent(input),
      sendMessage,
      maxAttempts: options.maxAttempts,
      // Extrair formato/movimentos de um WOD é classificação/extração
      // estruturada — não precisa do modelo mais caro (Opus 5). O
      // StrategyCoachAgent, que decide intensidade/segurança, continua
      // no modelo padrão (mais forte).
      model: "claude-sonnet-5",
    });
  } catch (err) {
    if (err instanceof AiJsonError) {
      throw new WodAnalysisError(err.message, err.rawResponse);
    }
    throw err;
  }
}
