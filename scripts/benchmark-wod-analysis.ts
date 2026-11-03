import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAiMessageSender } from '../packages/ai/dist/index.js';
import { analyzeWod } from '../packages/coach-engine/dist/index.js';
import { captureAiGeneration } from '../apps/api/src/services/ai-generation-metadata.js';
import { ladderSource } from '../tests/fixtures/wod-ladder-case.js';

// Use only the synthetic, visually checked ladder image; never access the app database.
const root = fileURLToPath(new URL('../', import.meta.url));
async function main() {
  if (!process.argv.includes('--live'))
    throw new Error('Use --live to run four paid analysis generations.');
  const image = await readFile(resolve(root, 'tests/fixtures/wod-ladder.png'));
  const send = createOpenAiMessageSender();
  const rows = [];
  const output = resolve(root, 'output/performance/wod-analysis-latency.json');
  for (let repeat = 1; repeat <= 2; repeat++) {
    for (const sourceType of repeat % 2 ? ['TEXT', 'IMAGE'] : ['IMAGE', 'TEXT']) {
      const attempts: Array<{ durationMs: number; status: string }> = [];
      const generation = captureAiGeneration(send, 'WodAnalyzerAgent', (attempt) =>
        attempts.push(attempt),
      );
      const started = performance.now();
      let analysis, error;
      try {
        analysis = await analyzeWod(
          sourceType === 'TEXT'
            ? { rawText: ladderSource }
            : {
                imageBase64: image.toString('base64'),
                imageMimeType: 'image/png',
              },
          generation.sendMessage,
        );
        assert.deepEqual(
          analysis.rounds?.map((round) => round.movements.map((m) => m.reps)),
          [
            [21, 21, 12],
            [15, 15, 10],
            [9, 9, 8],
          ],
        );
        assert.notEqual(analysis.format, 'AMRAP');
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      rows.push({
        sourceType,
        repeat,
        durationMs: performance.now() - started,
        success: !error,
        attemptCount: attempts.length,
        attempts,
        metadata: generation.metadata(),
        analysis: analysis ?? null,
        error: error ?? null,
      });
      await mkdir(dirname(output), { recursive: true });
      await writeFile(
        output,
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            source: ladderSource,
            imagePath: 'tests/fixtures/wod-ladder.png',
            syntheticFixture: true,
            model: 'gpt-5-mini',
            effort: 'low',
            maxOutputTokens: 2500,
            rows,
          },
          null,
          2,
        ),
      );
      const row = rows.at(-1)!;
      process.stdout.write(
        `${JSON.stringify({
          sourceType,
          repeat,
          durationMs: Math.round(row.durationMs),
          success: row.success,
          attempts: attempts.length,
        })}\n`,
      );
    }
  }
  if (rows.some((row) => !row.success)) process.exitCode = 1;
}
main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
