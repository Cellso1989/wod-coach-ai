import {
  wodAnalysisOutputSchema,
  type WodAnalysisOutput,
  type WodMovementOutput,
  type WodRoundOutput,
} from '@wod-coach-ai/validation';
import { WOD_FORMATS, MOVEMENT_CATEGORIES } from '@wod-coach-ai/types';
import type { RefinementCtx } from 'zod';
import { movementIdentity } from './movement-identity.js';
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
- Use os mesmos nomes e categorias entre resumo e blocos. Confira as somas de reps,
  metros e calorias; se qualquer parcela for desconhecida, o total deve ser null.
  Preserve cargas uniformes e descreva explicitamente as cargas variaveis por bloco.
- Leia o WOD com atenção para não confundir "rounds" (a estrutura de repetição do treino)
  com "sets" dentro de um único movimento — só use "rounds" para a estrutura macro do WOD.

Regras críticas:
- "movements" deve conter ao menos um movimento identificado no treino. Cada round
  declarado tambem deve conter ao menos um movimento. Nao retorne listas vazias.
- Em um bloco simples com volumes explicitos, preserve todos os movimentos e suas
  reps, metros ou calorias da fonte. Nao substitua movimentos na analise nem use
  null para um volume legivel; adaptacoes do atleta pertencem a estrategia.
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
  name: string;
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

  const name = start
    ? normalized.slice(start[0].length).trim()
    : normalized.slice(0, end!.index).trim();
  // Additional numbers can be loads, ladders or another movement: ask the model again.
  if (!name || /\d|%/.test(movementKey(name))) return null;
  return { value: Number(match[1]), unit, name };
}

function movementKey(name: string): string {
  return movementIdentity(name);
}

function simpleSourceMovementKey(name: string): string | null {
  const key = movementKey(name);
  const aliases: Record<string, string> = {
    burpee: 'burpee',
    burpees: 'burpee',
    row: 'row',
    rowing: 'row',
    run: 'run',
    running: 'run',
    thruster: 'thruster',
    thrusters: 'thruster',
    'air squat': 'air squat',
    'air squats': 'air squat',
    'pull up': 'pull up',
    'pull ups': 'pull up',
    'toes to bar': 'toes to bar',
    'handstand walk': 'handstand walk',
  };
  return Object.hasOwn(aliases, key) ? aliases[key]! : null;
}

function validateSimpleSourceIntegrity(
  output: WodAnalysisOutput,
  source: string,
  ctx: RefinementCtx,
): void {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!/^(?:for time|chipper|amrap\s+[1-9]\d*\s*min(?:utes|utos)?)\s*:?$/i.test(lines[0] ?? ''))
    return;
  if (lines.length < 2) return;
  const parsed = lines.slice(1).map(parseMovementLine);
  // Compare only a fully recognized single block; never partially parse phases or loads.
  if (
    parsed.some(
      (line) =>
        !line ||
        !simpleSourceMovementKey(line.name) ||
        line.value <= 0 ||
        (line.unit == null &&
          ['row', 'run', 'handstand walk'].includes(simpleSourceMovementKey(line.name)!)),
    )
  )
    return;
  const expected = new Map(parsed.map((line) => [simpleSourceMovementKey(line!.name), line!]));
  if (expected.size !== parsed.length) return;
  const actual = new Map(
    output.movements.map((item) => [simpleSourceMovementKey(item.name), item]),
  );
  const heading = lines[0]!.toLowerCase();
  const format = heading.startsWith('amrap')
    ? 'AMRAP'
    : heading.startsWith('chipper')
      ? 'CHIPPER'
      : 'FOR_TIME';
  const duration = heading.match(/^amrap\s+(\d+)/)?.[1];
  if (
    output.format !== format ||
    output.durationMinutes !== (duration == null ? null : Number(duration))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['format'],
      message: 'Preserve o formato e a janela AMRAP explicitos da fonte simples.',
    });
  }
  const order = [...expected.keys()];
  const execution = output.rounds?.length
    ? output.rounds.flatMap((round) => round.movements)
    : output.movements;
  if (
    execution.length !== order.length ||
    execution.some((item, index) => simpleSourceMovementKey(item.name) !== order[index])
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['movements'],
      message: 'Preserve a ordem dos movimentos da fonte simples.',
    });
  }
  if (
    actual.size !== output.movements.length ||
    actual.size !== expected.size ||
    [...actual.keys()].some((key) => !expected.has(key))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['movements'],
      message:
        'Preserve exatamente os movimentos do bloco simples da fonte, sem omissoes ou substituicoes.',
    });
  }
  for (const [key, line] of expected) {
    const item = actual.get(key);
    if (!item) continue;
    const metric =
      line.unit === 'distance' ? 'distanceMeters' : line.unit === 'calories' ? 'calories' : 'reps';
    if (
      item[metric] !== line.value ||
      execution.find((item) => simpleSourceMovementKey(item.name) === key)?.[metric] !==
        line.value ||
      (['reps', 'distanceMeters', 'calories'] as const).some(
        (other) => other !== metric && item[other] != null,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['movements'],
        message: `Preserve o volume explicito e a unidade de ${line.name} na fonte (${line.value} ${metric}).`,
      });
    }
  }
}

function validateRoundIntegrity(output: WodAnalysisOutput, ctx: RefinementCtx): void {
  if (!output.rounds?.length) return;
  const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['rounds'], message });
  if (output.rounds.some((round, index) => round.roundNumber !== index + 1)) {
    issue('Numere todos os rounds/blocos em ordem, sem saltos ou duplicatas.');
  }

  const summary = new Map(
    output.movements.map((movement) => [movementKey(movement.name), movement]),
  );
  if (summary.size !== output.movements.length)
    issue('Nao duplique movimentos no resumo agregado.');
  const blocks = new Map<string, WodMovementOutput[]>();
  for (const round of output.rounds) {
    for (const movement of round.movements) {
      const key = movementKey(movement.name);
      const items = blocks.get(key) ?? [];
      items.push(movement);
      blocks.set(key, items);
      if (!summary.has(key))
        issue(`Inclua ${movement.name} no resumo agregado usando o mesmo nome.`);
    }
  }
  for (const [key, movement] of summary) {
    const items = blocks.get(key);
    if (!items) {
      issue(`Preserve ${movement.name} na sequencia de execucao.`);
      continue;
    }
    if (items.some((item) => item.category !== movement.category)) {
      issue(`Mantenha a categoria de ${movement.name} coerente entre resumo e blocos.`);
    }
    for (const metric of ['reps', 'distanceMeters', 'calories'] as const) {
      const total = movement[metric];
      if (total == null) continue;
      const known = items.filter((item) => item[metric] != null);
      const sum = known.reduce((value, item) => value + item[metric]!, 0);
      if (known.length !== items.length || Math.abs(sum - total) > 0.001) {
        issue(
          `Confira ${metric} de ${movement.name}: o total deve corresponder a todos os blocos; use null se desconhecido.`,
        );
      }
    }
    const loads = items.map(
      (item) => item.loadDescription?.toLowerCase().replace(/\s/g, '') ?? null,
    );
    const totalLoad = movement.loadDescription?.toLowerCase().replace(/\s/g, '');
    if (
      totalLoad &&
      loads.every((load) => load != null && load === loads[0]) &&
      totalLoad !== loads[0]
    ) {
      issue(`Preserve a carga uniforme de ${movement.name} no resumo e nos blocos.`);
    }
  }
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
    .slice(0, movementCount)
    .map(parseMovementLine)
    .filter((line): line is ParsedMovementLine => line != null);
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
  if (output.movements.some((movement) => movement.loadDescription)) return output;

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
    if (movementKey(movement.name) !== movementKey(line.name)) return output;
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
          validateRoundIntegrity(output, ctx);
          for (const source of [input.rawText, output.extractedText]) {
            if (source?.trim()) validateSimpleSourceIntegrity(output, source, ctx);
          }
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
