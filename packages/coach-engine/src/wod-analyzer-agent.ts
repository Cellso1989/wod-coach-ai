import {
  wodAnalysisOutputSchema,
  type WodAnalysisOutput,
  type WodMovementOutput,
  type WodRoundOutput,
} from '@wod-coach-ai/validation';
import { WOD_FORMATS, MOVEMENT_CATEGORIES } from '@wod-coach-ai/types';
import {
  callAiForJson,
  AiJsonError,
  type AiMessageContent,
  type SendMessage,
} from './ai-json-agent.js';

export type { SendMessage } from './ai-json-agent.js';

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
  "extractedText": string ou null,
  "format": uma string entre ${WOD_FORMATS.join(' | ')} ou null,
  "durationMinutes": number ou null,
  "stimulus": string curto (ex: "mixed_modal", "heavy strength") ou null,
  "movements": [
    {
      "name": string,
      "category": uma string entre ${MOVEMENT_CATEGORIES.join(' | ')},
      "reps": number ou null (total somado de todos os rounds, quando o WOD tiver rounds),
      "distanceMeters": number ou null,
      "loadDescription": string ou null (ex: "60/40kg", "75% do 1RM"),
      "calories": number ou null
    }
  ],
  "rounds": null OU array de rounds (ver regra abaixo) [
    {
      "roundNumber": number (1, 2, 3...),
      "label": string opcional (ex: "Buy-in", "Round 1", "Round 2", "Buy-out"),
      "movements": [ mesmo formato de um item de "movements" acima ]
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

Regra crítica sobre "rounds" (WODs com estrutura por round):
- "rounds" representa a SEQUENCIA REAL DE EXECUCAO do treino, nao apenas rounds formais.
  Sempre preserve a ordem recebida. Se houver buy-in, bloco principal e buy-out, inclua
  tudo em ordem com "label" claro. Ex: "Buy-in: 25 thrusters; 3 rounds de 55 DU + 10 BMU;
  Buy-out: 25 thrusters" deve virar 5 blocos: Buy-in, Round 1, Round 2, Round 3, Buy-out.
  NUNCA esconda buy-in/buy-out somando no total agregado.
- Muitos WODs são vários rounds em que a reps/carga de um ou mais movimentos MUDA de
  round para round (ex: 3 rounds de 30-20-10 HSPU / 15 Thrusters / 10 Bar M.U. — o HSPU
  desce 30→20→10 mas Thruster e BMU ficam fixos por round; ou escadas ascendentes/
  descendentes; ou carga que aumenta a cada round). Nesses casos, SEMPRE preencha
  "rounds" com um item por round, cada um com as reps/carga REAIS daquele round
  específico — nunca deixe essa variação escondida só no total agregado de "movements".
- Mesmo em rounds uniformes (ex: "5 rounds de 10 pull-ups + 15 air squats"),
  preserve cada round com as reps/cargas daquele round. Use null apenas quando
  nao houver estrutura por rounds/blocos definida; uma meta de rounds em AMRAP
  nao define uma quantidade fixa de rounds a executar.
- Quando preencher "rounds", o campo "movements" no nível raiz continua obrigatório e
  deve conter o TOTAL somado de cada movimento (soma de todos os rounds) — "rounds" é
  informação adicional para pacing, não substitui o resumo agregado.
- Leia o WOD com atenção para não confundir "rounds" (a estrutura de repetição do treino)
  com "sets" dentro de um único movimento — só use "rounds" para a estrutura macro do WOD.

Regras críticas:
- "movements" deve conter ao menos um movimento identificado no treino. Cada round
  declarado tambem deve conter ao menos um movimento. Nao retorne listas vazias.
- Seja OBJETIVO E CONCISO. O atleta lê isso no celular, no meio do treino. "stimulus"
  deve ser uma expressão curta (2-4 palavras, ex: "engine + grip", "força pesada"), e
  cada item de "warnings" deve ser uma frase curta e direta, sem explicações longas.
- Campos de enum devem ser strings escalares, nunca arrays: use "format": "AMRAP",
  nunca "format": ["AMRAP"]; use "category": "gymnastics", nunca
  "category": ["gymnastics"].
- "extractedText" deve conter a transcricao limpa do WOD quando a entrada tiver imagem.
  Preserve quebras de linha, numeros, unidades e abreviacoes importantes. Se a entrada ja
  tiver texto suficiente e nenhuma imagem, use null.
- Trate SOMENTE de CrossFit: AMRAP, EMOM, E2MOM, For Time, Chipper, Rounds For Time,
  Strength, Weightlifting, Gymnastics, Conditioning, Monostructural, Benchmark/Hero WODs.
- NUNCA invente números que não conseguir inferir do treino (seção 38). Se não souber,
  use null e explique a limitação em "warnings".
- "confidence" deve refletir sua real certeza — baixa se o texto/imagem for ambíguo,
  incompleto ou difícil de ler.
- Se receber uma imagem, leia o quadro/tela com atenção antes de responder.
- REGRA PRIORITARIA: se o WOD contem "N rounds", "N rds", "N rodadas" ou titulo tipo
  "5 Rounds", preencha "rounds" com N itens mesmo quando os rounds forem identicos.
  Buy-in e buy-out sao itens adicionais, nao substituem os N rounds. Se houver
  varios blocos com contagens fixas, preserve todos em ordem. Numere os itens de
  1 em diante, sem saltos ou duplicatas.
  Nunca devolva apenas totais agregados nesse caso.
- Responda APENAS com o JSON. Nenhum outro texto.`;

function buildUserContent(input: WodAnalyzerInput): AiMessageContent {
  const content: AiMessageContent = [];

  if (input.imageBase64 && input.imageMimeType) {
    content.push({
      type: 'image',
      imageBase64: input.imageBase64,
      imageMimeType: input.imageMimeType,
    });
  }

  content.push({
    type: 'text',
    text: input.rawText?.trim()
      ? `Treino recebido (texto):\n\n${input.rawText.trim()}`
      : 'Treino recebido apenas como imagem (ver acima).',
  });

  return content;
}

function explicitRoundCounts(text: string): number[] {
  return [...text.matchAll(/(?<![\w.,])([1-9]\d*)\s*(?:rounds?|rds?|rodadas?)\b/gi)]
    .filter(
      (match) => !/\b(?:meta|goal|target|objetivo)\s*:?\s*$/i.test(text.slice(0, match.index)),
    )
    .map((match) => Number(match[1]));
}

function extractExplicitRoundCount(text: string): number | null {
  return explicitRoundCounts(text)[0] ?? null;
}

function executionBlockCount(text: string): number {
  const counts = explicitRoundCounts(text);
  if (!counts.length) return 0;
  return (
    counts.reduce((sum, count) => sum + count, 0) +
    Number(/\bbuy[\s-]?in\b/i.test(text)) +
    Number(/\bbuy[\s-]?out\b/i.test(text))
  );
}

interface ParsedMovementLine {
  value: number;
  unit: 'distance' | 'reps' | 'calories' | null;
}

function parseMovementLine(line: string): ParsedMovementLine | null {
  const normalized = line.trim().replace(',', '.');
  const start = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(m|metros?|meters?|cal(?:s|orias?)?|reps?)?\b/i,
  );
  const end = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*(m|metros?|meters?|cal(?:s|orias?)?|reps?)\s*$/i,
  );
  const match = start ?? end;
  if (!match?.[1]) return null;

  const unitText = match[2]?.toLowerCase() ?? null;
  const unit =
    unitText == null
      ? null
      : /^m|metro|meter/.test(unitText)
        ? 'distance'
        : /^cal/.test(unitText)
          ? 'calories'
          : 'reps';

  return { value: Number(match[1]), unit };
}

function findRoundMovementLines(text: string, roundCount: number, movementCount: number) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const roundLineIndex = lines.findIndex((line) => extractExplicitRoundCount(line) === roundCount);
  if (roundLineIndex < 0) return [];

  return lines
    .slice(roundLineIndex + 1)
    .map(parseMovementLine)
    .filter((line): line is ParsedMovementLine => line != null)
    .slice(0, movementCount);
}

function metricForMovement(movement: WodMovementOutput): 'distance' | 'reps' | 'calories' | null {
  if (movement.distanceMeters != null) return 'distance';
  if (movement.reps != null) return 'reps';
  if (movement.calories != null) return 'calories';
  return null;
}

function totalForMetric(movement: WodMovementOutput, metric: 'distance' | 'reps' | 'calories') {
  if (metric === 'distance') return movement.distanceMeters ?? null;
  if (metric === 'reps') return movement.reps ?? null;
  return movement.calories ?? null;
}

function movementWithPerRoundValue(
  movement: WodMovementOutput,
  metric: 'distance' | 'reps' | 'calories',
  value: number,
): WodMovementOutput {
  return {
    name: movement.name,
    category: movement.category,
    loadDescription: movement.loadDescription,
    reps: metric === 'reps' ? value : null,
    distanceMeters: metric === 'distance' ? value : null,
    calories: metric === 'calories' ? value : null,
  };
}

function inferUniformRoundsFromText(
  output: WodAnalysisOutput,
  sourceText: string,
): WodAnalysisOutput {
  if (output.rounds?.length) return output;

  const roundCount = extractExplicitRoundCount(sourceText);
  if (!roundCount || roundCount < 2 || roundCount > 20) return output;
  // Only reconstruct a single uniform block, never mixed execution phases.
  if (
    explicitRoundCounts(sourceText).length !== 1 ||
    executionBlockCount(sourceText) !== roundCount
  )
    return output;

  const parsedLines = findRoundMovementLines(sourceText, roundCount, output.movements.length);
  if (parsedLines.length < output.movements.length) return output;

  const perRoundMovements: WodMovementOutput[] = [];
  for (let index = 0; index < output.movements.length; index++) {
    const movement = output.movements[index]!;
    const line = parsedLines[index]!;
    const metric = metricForMovement(movement);
    if (!metric) return output;
    if (line.unit && line.unit !== metric) return output;

    const total = totalForMetric(movement, metric);
    if (total == null || Math.abs(total - line.value * roundCount) > 0.001) {
      return output;
    }

    perRoundMovements.push(movementWithPerRoundValue(movement, metric, line.value));
  }

  const rounds: WodRoundOutput[] = Array.from({ length: roundCount }, (_, index) => ({
    roundNumber: index + 1,
    label: `Round ${index + 1}`,
    movements: perRoundMovements,
  }));

  return { ...output, rounds };
}

function normalizeAnalysisOutput(
  output: WodAnalysisOutput,
  input: WodAnalyzerInput,
): WodAnalysisOutput {
  return [input.rawText, output.extractedText].reduce<WodAnalysisOutput>(
    (result, text) => (text?.trim() ? inferUniformRoundsFromText(result, text) : result),
    output,
  );
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
    throw new WodAnalysisError('Nenhum texto ou imagem de WOD fornecido para análise');
  }

  try {
    const output = await callAiForJson({
      schema: wodAnalysisOutputSchema
        .transform((output) => normalizeAnalysisOutput(output, input))
        .pipe(wodAnalysisOutputSchema)
        .superRefine((output, ctx) => {
          // Check each source separately: extracted text may repeat the user's text.
          const expected = Math.max(
            executionBlockCount(input.rawText ?? ''),
            executionBlockCount(output.extractedText ?? ''),
          );
          if (!expected) return;
          for (const phase of ['in', 'out']) {
            const marker = new RegExp(`\\bbuy[\\s-]?${phase}\\b`, 'i');
            const explicit = [input.rawText, output.extractedText].some((text) =>
              marker.test(text ?? ''),
            );
            if (explicit && !output.rounds?.some((round) => marker.test(round.label ?? ''))) {
              ctx.addIssue({
                code: 'custom',
                path: ['rounds'],
                message: `Identifique o buy-${phase} em um bloco separado com label, sem agrega-lo aos rounds principais.`,
              });
            }
          }
          if ((output.rounds?.length ?? 0) < expected) {
            ctx.addIssue({
              code: 'custom',
              path: ['rounds'],
              message: `Preserve pelo menos ${expected} itens: todos os rounds fixos e buy-in/buy-out explicitos, sem apenas totais agregados.`,
            });
          } else if (output.rounds!.some((round, index) => round.roundNumber !== index + 1)) {
            ctx.addIssue({
              code: 'custom',
              path: ['rounds'],
              message:
                'Numere os rounds/blocos em ordem, de 1 em diante, sem saltos ou duplicatas.',
            });
          }
        }),
      systemPrompt: SYSTEM_PROMPT,
      userContent: buildUserContent(input),
      sendMessage,
      maxAttempts: options.maxAttempts,
      // Extrair formato/movimentos de um WOD é classificação/extração
      // estruturada — não precisa do modelo mais caro. O StrategyCoachAgent,
      // que decide intensidade/segurança, continua no modelo padrão
      // mais forte.
      model: 'gpt-5-mini',
      maxTokens: 2500,
      effort: 'low',
    });
    return output;
  } catch (err) {
    if (err instanceof AiJsonError) {
      throw new WodAnalysisError(err.message, err.rawResponse);
    }
    throw err;
  }
}
