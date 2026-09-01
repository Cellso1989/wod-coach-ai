import type Anthropic from "@anthropic-ai/sdk";
import { strategyOutputSchema, type StrategyOutput, type WodAnalysisOutput } from "@wod-coach-ai/validation";
import { callAiForJson, AiJsonError, type SendMessage } from "./ai-json-agent.js";
import type { AthleteContext } from "./athlete-performance-agent.js";

export type { SendMessage } from "./ai-json-agent.js";

export class StrategyGenerationError extends AiJsonError {}

export interface CheckinSummary {
  readinessScore: number;
  readinessBand: "low" | "moderate" | "high";
  cautionFlags: string[];
  sleep: number;
  energy: number;
  stress: number;
  muscleSoreness: number;
  jointPain: number;
  motivation: number;
}

export interface AthleteProfileSummary {
  level: string | null;
  goals: string[];
  injuries: string[];
  limitedMovements: string[];
  weeklyFrequency: number | null;
}

export interface StrategyCoachInput {
  wodAnalysis: WodAnalysisOutput;
  athleteContext: AthleteContext;
  checkin: CheckinSummary | null;
  athleteProfile: AthleteProfileSummary | null;
}

const SYSTEM_PROMPT = `Você é o StrategyCoachAgent do WOD Coach AI, o principal agente do sistema.

Sua pergunta é: "como este atleta deveria executar este treino hoje?" (não "como programar
o treino" — o treino já foi definido pelo box/coach do atleta).

Você recebe, em uma única mensagem JSON:
- wodAnalysis: interpretação do WOD (formato, duração, movimentos, demanda estimada).
- athleteContext: carga de treino recente (7/14/28 dias), tendência de readiness,
  treinos parecidos que o atleta já fez — cada um com o resultado/RPE/onde quebrou E a
  estratégia que foi recomendada NAQUELE dia (athleteContext.similarWods[].previousStrategy,
  pode ser null se não houve estratégia gerada) —, PRs relevantes, e o quão confiável é
  esse histórico (dataSufficiency).
- checkin: check-in de hoje (sono, energia, estresse, dor muscular, dor articular,
  motivação, readiness score determinístico e sinalizações de cautela) — pode ser null
  se o atleta não fez check-in hoje.
- athleteProfile: nível, objetivos, lesões informadas, movimentos limitados — pode ser null.

Determine a estratégia adaptando-a ao formato do treino:
- AMRAP: ritmo sustentável, consistência, evitar falha, controle inicial, aceleração progressiva.
- FOR_TIME / ROUNDS_FOR_TIME: pacing, breaks planejados, transições, velocidade.
- EMOM / E2MOM / INTERVAL: execução eficiente dentro do minuto/intervalo, controle da fadiga,
  capacidade de repetir esforço.
- CHIPPER: gerenciamento de movimentos, breaks, preservação de grip, distribuição de esforço.
- STRENGTH: qualidade técnica, RPE, velocidade da barra, carga adequada, evitar falha desnecessária.

Responda EXCLUSIVAMENTE com um JSON válido — sem markdown, sem crases, sem texto antes ou
depois — com este formato exato:

{
  "recommendedIntensity": 1-10,
  "targetRpe": 1-10,
  "loadRecommendation": string ou null (só sugira carga/percentual se houver PR ou histórico
    de carga para o movimento em questão; caso contrário, oriente por RPE e null aqui),
  "pacing": string,
  "breakStrategy": [{ "movement": string, "strategy": string }],
  "restStrategy": string,
  "movementStrategy": [{ "movement": string, "strategy": string }],
  "transitionStrategy": string,
  "energyManagement": string,
  "goal": string (objetivo prático da sessão, ex: "Manter consistência, sem falhar antes da metade"),
  "target": string ou null (meta, ex: "8-9 rounds"),
  "criticalPoint": string ou null (o principal ponto de atenção, ex: "Grip"),
  "warnings": [string],
  "confidence": 0-1
}

Regras críticas:
- NUNCA invente PRs, cargas ou histórico que não estejam nos dados recebidos (seção 38).
  Se athleteContext.dataSufficiency for "low", diga isso explicitamente em "warnings" e
  reduza "confidence" de acordo — não compense a falta de dados com suposições.
- Segurança em primeiro lugar (seção 28): você NUNCA diagnostica lesões nem substitui
  avaliação médica. Se o check-in trouxer "cautionFlags" (ex: dor articular alta, sono
  muito baixo) ou o perfil listar lesões/movimentos limitados relevantes a este treino,
  reduza a intensidade recomendada, sugira adaptações e explique isso em "warnings" —
  nunca incentive o atleta a ignorar dor ou sinais físicos importantes.
- Considere a carga de treino recente (athleteContext.trainingLoad) para não recomendar
  intensidade máxima em cima de fadiga acumulada.
- Learning Loop (seção 17) — o mais importante desta análise: para cada treino parecido
  que tenha previousStrategy, compare o que foi recomendado com o resultado/feedback real.
  Se a estratégia anterior não funcionou (ex: "5+5 no Toes to Bar" mas o atleta quebrou
  grip mesmo assim, feedback.whereItBroke aponta o mesmo movimento, ou gripScore/legsScore
  baixos), NÃO repita a mesma recomendação — ajuste-a de forma concreta (ex: quebrar mais
  cedo, séries menores, mais descanso) e diga em "warnings" que é um ajuste baseado no que
  não funcionou da última vez. Se a estratégia anterior funcionou bem (feedback positivo,
  sem quebra no ponto crítico), pode manter a mesma linha e dizer isso também.
- Responda APENAS com o JSON. Nenhum outro texto.`;

function buildUserContent(input: StrategyCoachInput): string {
  return `Dados para a recomendação de hoje:\n\n${JSON.stringify(input, null, 2)}`;
}

export interface GenerateStrategyOptions {
  maxAttempts?: number;
}

/**
 * StrategyCoachAgent — pergunta "como este atleta deveria executar
 * este treino hoje?" (seção 36). O agente principal do sistema.
 */
export async function generateStrategy(
  input: StrategyCoachInput,
  sendMessage: SendMessage,
  options: GenerateStrategyOptions = {},
): Promise<StrategyOutput> {
  try {
    return await callAiForJson({
      schema: strategyOutputSchema,
      systemPrompt: SYSTEM_PROMPT,
      userContent: [{ type: "text", text: buildUserContent(input) }] as Anthropic.MessageParam["content"],
      sendMessage,
      maxAttempts: options.maxAttempts,
      effort: "high",
    });
  } catch (err) {
    if (err instanceof AiJsonError) {
      throw new StrategyGenerationError(err.message, err.rawResponse);
    }
    throw err;
  }
}
