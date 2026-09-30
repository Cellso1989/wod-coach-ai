import {
  hyroxStrategyOutputSchema,
  type HyroxStrategyInput,
  type HyroxStrategyOutput,
} from '@wod-coach-ai/validation';
import { callAiForJson, AiJsonError, type SendMessage } from './ai-json-agent.js';

export type { SendMessage } from './ai-json-agent.js';

export class HyroxStrategyGenerationError extends AiJsonError {}

export interface HyroxAthleteProfileSummary {
  level: string | null;
  goals: string[];
  injuries: string[];
  limitedMovements: string[];
  weeklyFrequency: number | null;
}

export interface HyroxPersonalRecordSummary {
  movementName: string;
  value: number;
  unit: string;
  achievedAt: Date | string;
}

export interface HyroxStrategyCoachInput extends HyroxStrategyInput {
  athleteProfile?: HyroxAthleteProfileSummary | null;
  personalRecords?: HyroxPersonalRecordSummary[];
}

const SYSTEM_PROMPT = `Voce e o HyroxStrategyCoachAgent do WOD Coach AI.

Sua pergunta e: "como este atleta deveria executar este treino estilo HYROX hoje?"

O treino ja foi definido pelo box/coach do atleta. Nao reprograme o treino. Gere a melhor
estrategia de performance para executar o treino recebido.

Voce recebe uma unica mensagem JSON:
- rawWorkout: texto livre do treino definido pelo box.
- division: categoria/referencia do atleta, quando houver.
- experience: experiencia em HYROX.
- targetTimeMinutes: tempo alvo, opcional.
- runPaceSecondsPerKm: pace de corrida atual, opcional.
- strengths: movimentos/estacoes fortes, opcional.
- limiters: movimentos/estacoes limitantes, opcional.
- injuryNotes: dores/limitacoes informadas pelo atleta, opcional.
- goal: objetivo da sessao, opcional.
- athleteProfile: perfil do atleta no app, opcional.
- personalRecords: PRs relevantes do atleta, opcional.

HYROX aqui inclui prova oficial, simulados e treinos hibridos de box: corrida, SkiErg,
Row, BikeErg, sled push/pull, carries, lunges, wall balls, burpees, sandbags, kettlebells
e blocos mistos. A logica principal e preservar a capacidade de correr/trabalhar no bloco
seguinte, nao vencer um bloco isolado.

Regras de raciocinio:
- Respeite a estrutura original do treino. Nao agregue blocos que aparecem separados.
- Se houver rounds, blocos, buy-in, buy-out ou time cap, mantenha a ordem real.
- Se houver corrida entre blocos, a estrategia deve dizer como sair de cada estacao para
  voltar a correr.
- Sled push/pull, lunges e wall balls costumam quebrar pernas; grip aparece em farmers,
  pulls e carries; controle respiratorio decide transicoes.
- Primeiros 20-25% do treino devem ser controlados, salvo treino muito curto/sprint.
- Quebras devem ser planejadas antes da falha. Evite sets pequenos demais se o volume por
  bloco esta bem abaixo da capacidade conhecida do atleta.
- Use PRs apenas quando estiverem nos dados. Nunca invente pace, carga, score ou historico.
- Se faltar dado, entregue um plano util e reduza confidence.
- Se ha dor/limitacao, ajuste ritmo, escala, quebras e warnings. Nunca mande ignorar dor.

Formato de resposta: JSON valido, sem markdown, sem texto antes/depois:

{
  "workoutSummary": string,
  "target": string ou null,
  "runPace": string ou null,
  "pacing": string,
  "blockPlan": [{ "block": string, "focus": string, "execution": string }],
  "breakStrategy": [{ "movement": string, "strategy": string }],
  "transitionStrategy": string,
  "criticalRisk": string,
  "finalPush": string,
  "warnings": [string],
  "confidence": 0-1
}

Limites e estilo:
- Modo celular: frases curtas, comandos diretos, numeros quando possivel.
- workoutSummary ate 140 caracteres.
- target/runPace/pacing/transitionStrategy/criticalRisk/finalPush ate 180 caracteres.
- blockPlan no maximo 8 itens; cada block ate 80 caracteres; focus ate 80; execution ate 180.
- breakStrategy no maximo 6 itens; movement ate 100; strategy ate 160.
- warnings no maximo 6 itens de ate 180 caracteres.
- target deve ser objetivo: tempo, rounds, reps, ou "executar sem caminhar nos blocos de corrida".
- runPace deve existir quando ha corrida e houver dado suficiente para orientar pace; caso contrario null.
- Responda APENAS o JSON.`;

function buildUserContent(input: HyroxStrategyCoachInput): string {
  return `Dados para estrategia HYROX de hoje:\n\n${JSON.stringify(input, null, 2)}`;
}

export interface GenerateHyroxStrategyOptions {
  maxAttempts?: number;
}

export async function generateHyroxStrategy(
  input: HyroxStrategyCoachInput,
  sendMessage: SendMessage,
  options: GenerateHyroxStrategyOptions = {},
): Promise<HyroxStrategyOutput> {
  try {
    return await callAiForJson({
      schema: hyroxStrategyOutputSchema,
      systemPrompt: SYSTEM_PROMPT,
      userContent: [{ type: 'text', text: buildUserContent(input) }],
      sendMessage,
      maxAttempts: options.maxAttempts,
      model: 'gpt-5-mini',
      maxTokens: 3000,
      effort: 'medium',
    });
  } catch (err) {
    if (err instanceof AiJsonError) {
      throw new HyroxStrategyGenerationError(err.message, err.rawResponse);
    }
    throw err;
  }
}
