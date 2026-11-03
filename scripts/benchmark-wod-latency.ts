import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOpenAiMessageSender } from '../packages/ai/dist/index.js';
import { generateStrategy, type StrategyCoachInput } from '../packages/coach-engine/dist/index.js';
import { wodAnalysisOutputSchema } from '../packages/validation/dist/index.js';
import { captureAiGeneration } from '../apps/api/src/services/ai-generation-metadata.js';
import { ladderAnalysis, ladderSource } from '../tests/fixtures/wod-ladder-case.js';
import {
  productionIntervalAnalysis,
  productionIntervalSource,
} from '../tests/fixtures/wod-scored-interval-production.js';

type Effort = 'low' | 'medium';
export interface BenchmarkRow {
  effort: Effort;
  success: boolean;
  durationMs: number;
  attemptCount: number;
}

export function summarizeLatency(rows: BenchmarkRow[]) {
  const percentile = (values: number[], p: number) =>
    values.length
      ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)]
      : null;
  return (['low', 'medium'] as const).map((effort) => {
    const group = rows.filter((row) => row.effort === effort);
    const successful = group.filter((row) => row.success);
    return {
      effort,
      samples: group.length,
      successes: successful.length,
      failures: group.length - successful.length,
      retried: group.filter((row) => row.attemptCount > 1).length,
      successP50Ms: percentile(
        successful.map((row) => row.durationMs),
        0.5,
      ),
      successP95Ms: percentile(
        successful.map((row) => row.durationMs),
        0.95,
      ),
      allP95Ms: percentile(
        group.map((row) => row.durationMs),
        0.95,
      ),
    };
  });
}

/** Fixed, fictitious athlete; no database access or persisted workout mutations. */
export function benchmarkCases(): Array<{ id: string; input: StrategyCoachInput }> {
  const shared: Omit<StrategyCoachInput, 'wodAnalysis'> = {
    athleteProfile: {
      level: 'INTERMEDIATE',
      goals: ['performance'],
      injuries: [],
      limitedMovements: [],
      weeklyFrequency: 5,
    },
    athleteContext: {
      trainingLoad: {
        last7Days: { days: 7, sessionCount: 3 },
        last14Days: { days: 14, sessionCount: 7 },
        last28Days: { days: 28, sessionCount: 15 },
      },
      similarWods: [],
      relevantPersonalRecords: [],
      dataSufficiency: 'low',
    },
  };
  const interval = structuredClone(productionIntervalAnalysis);
  for (const movement of [
    ...interval.movements,
    ...interval.rounds!.flatMap((round) => round.movements),
  ]) {
    if (movement.category === 'weightlifting') movement.loadDescription = null;
  }
  interval.extractedText = productionIntervalSource;
  const analyses = [
    {
      id: 'amrap',
      analysis: {
        extractedText: 'AMRAP 12 min\n6 Pull-ups\n12 Air squats',
        format: 'AMRAP',
        durationMinutes: 12,
        targetMinutes: null,
        rounds: null,
        movements: [
          { name: 'Pull-up', category: 'gymnastics', reps: 6 },
          { name: 'Air Squat', category: 'gymnastics', reps: 12 },
        ],
        estimatedDemand: { engine: 7, grip: 6, legs: 6, gymnastics: 5, technical: 3 },
        stimulus: 'mixed_modal',
        estimatedIntensity: 8,
        confidence: 0.9,
        warnings: [],
      },
    },
    {
      id: 'ladder',
      analysis: { ...ladderAnalysis, extractedText: `${ladderSource}\nTime cap: 12 min` },
    },
    { id: 'scored-intervals', analysis: interval },
  ];
  return analyses.map(({ id, analysis }) => ({
    id,
    input: { ...structuredClone(shared), wodAnalysis: wodAnalysisOutputSchema.parse(analysis) },
  }));
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--live'))
    throw new Error('Use --live to run the paid provider comparison. No database is used.');
  const repeats = Number(args.find((arg) => arg.startsWith('--repeats='))?.split('=')[1] ?? 2);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10)
    throw new Error('repeats must be 1..10');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = resolve(
    root,
    args.find((arg) => arg.startsWith('--output='))?.slice(9) ??
      'output/performance/wod-latency.json',
  );
  const send = createOpenAiMessageSender();
  const caseId = args.find((arg) => arg.startsWith('--case='))?.slice(7);
  const cases = benchmarkCases().filter((item) => !caseId || item.id === caseId);
  if (!cases.length) throw new Error('Unknown benchmark case');
  const rows: Array<BenchmarkRow & Record<string, unknown>> = [];
  const save = async () => {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          model: 'gpt-5-mini',
          maxOutputTokens: 8000,
          repeats,
          plannedGenerations: repeats * cases.length * 2,
          qualityReview:
            'Automatic validation only. Coaching quality still needs human review. Keep medium in production.',
          summary: summarizeLatency(rows),
          rows,
        },
        null,
        2,
      ),
    );
  };
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const { id, input } of cases) {
      // Alternate order per case and repeat to reduce order/traffic/cache bias.
      const efforts: Effort[] =
        (repeat + cases.findIndex((c) => c.id === id)) % 2 ? ['medium', 'low'] : ['low', 'medium'];
      for (const effort of efforts) {
        const attempts: Array<{ durationMs: number; status: string }> = [];
        const corrections: string[] = [];
        const generation = captureAiGeneration(
          async (params) => {
            if (params.messages.length > 1) {
              const last = params.messages.at(-1)!;
              // Record the validation reason without duplicating the prior response/prompt.
              corrections.push(
                last.content
                  .filter((part) => part.type === 'text')
                  .map((part) =>
                    part.type === 'text' ? part.text.split('Resposta anterior:')[0] : '',
                  )
                  .join(''),
              );
            }
            return send(params);
          },
          'StrategyCoachAgent',
          (attempt) => attempts.push(attempt),
        );
        const started = performance.now();
        let strategy, error;
        try {
          strategy = await generateStrategy(input, generation.sendMessage, { effort });
        } catch (err) {
          error =
            err instanceof Error
              ? { name: err.constructor.name, message: err.message }
              : { message: String(err) };
        }
        const row = {
          caseId: id,
          repeat: repeat + 1,
          effort,
          success: Boolean(strategy),
          durationMs: performance.now() - started,
          attemptCount: attempts.length,
          attempts,
          corrections,
          metadata: generation.metadata(),
          input,
          strategy: strategy ?? null,
          error: error ?? null,
        };
        rows.push(row);
        await save();
        process.stdout.write(
          `${JSON.stringify({
            caseId: id,
            repeat: repeat + 1,
            effort,
            success: row.success,
            durationMs: Math.round(row.durationMs),
            attempts: attempts.length,
          })}\n`,
        );
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ output, summary: summarizeLatency(rows) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
