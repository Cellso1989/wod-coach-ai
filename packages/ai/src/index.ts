/**
 * Thin Claude API client wrapper. Agent-specific prompts and Zod
 * validation of AI output live in @wod-coach-ai/coach-engine and
 * are added starting Fase 5.
 */
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(apiKey: string = process.env.ANTHROPIC_API_KEY ?? ""): Anthropic {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

/**
 * Traduz um erro vindo direto do SDK da Anthropic (crédito esgotado, limite
 * de taxa, chave inválida, instabilidade do lado deles) numa mensagem
 * amigável em PT-BR para mostrar no app — em vez de deixar a rota devolver
 * um 500 genérico sem explicação. Retorna null se `err` não for um erro do
 * SDK (nesse caso o chamador deve tratar/relançar normalmente).
 */
export function describeAnthropicApiError(err: unknown): { status: number; message: string } | null {
  if (!(err instanceof Anthropic.APIError)) {
    return null;
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 503, message: "A chave da API de IA é inválida ou expirou" };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message: "Limite de uso da IA atingido no momento — tente novamente em alguns minutos",
    };
  }
  if (err instanceof Anthropic.BadRequestError && /credit|billing|saldo/i.test(err.message)) {
    return {
      status: 503,
      message: "O saldo da conta de IA acabou — é preciso adicionar créditos na Anthropic para continuar",
    };
  }
  return {
    status: 502,
    message: "A IA está indisponível no momento. Tente novamente em instantes",
  };
}
