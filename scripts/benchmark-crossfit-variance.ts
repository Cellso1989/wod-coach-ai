import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { benchmarkCases } from './benchmark-wod-latency.js';
import { generateStrategy } from '../packages/coach-engine/dist/index.js';
import { createOpenAiMessageSender, type SendMessageParams } from '../packages/ai/dist/index.js';
import {
  captureAiGeneration,
  type AiAttemptTiming,
} from '../apps/api/src/services/ai-generation-metadata.js';

// Controlled, fictitious inputs only; never reads or writes application data.
const sender = createOpenAiMessageSender();
const rows: Array<Record<string, unknown>> = [];
const model = 'gpt-5.4-mini-2026-03-17';
const output = 'output/performance/crossfit-variance.json';
await mkdir('output/performance', { recursive: true });
for (let repeat = 1; repeat <= 3; repeat++)
  for (const fixture of benchmarkCases()) {
    // Alternate order to limit systematic warmup bias; exact prefix may still share cache.
    for (const routing of repeat % 2 ? ['default', 'stable'] : ['stable', 'default']) {
      const attempts: AiAttemptTiming[] = [];
      const validations: unknown[] = [];
      const generation = captureAiGeneration(
        async (params: SendMessageParams) =>
          sender({
            ...params,
            model,
            effort: 'medium',
            maxTokens: 8000,
            ...(routing === 'stable'
              ? {
                  promptCacheKey:
                    'wod-StrategyCoachAgent-' +
                    createHash('sha256').update(params.systemPrompt).digest('hex').slice(0, 32),
                }
              : {}),
          }),
        'StrategyCoachAgent',
        (attempt) =>
          attempts.push({ ...attempt, cacheRouting: routing === 'stable' ? 'stable' : 'default' }),
      );
      const started = performance.now();
      let success = false;
      let error: string | null = null;
      try {
        await generateStrategy(fixture.input, generation.sendMessage, {
          onValidation: (value) => validations.push(value),
        });
        success = true;
      } catch (cause) {
        error = cause instanceof Error ? cause.name : 'UnknownError';
      }
      rows.push({
        fixture: fixture.id,
        repeat,
        routing,
        model,
        effort: 'medium',
        maxOutputTokens: 8000,
        success,
        error,
        durationMs: performance.now() - started,
        attempts,
        validations,
      });
      await writeFile(
        output,
        JSON.stringify(
          { schemaVersion: 1, synthetic: true, completedAt: new Date().toISOString(), rows },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          fixture: fixture.id,
          repeat,
          routing,
          success,
          attempts: attempts.length,
          durationMs: rows.at(-1)!.durationMs,
        }),
      );
    }
  }
