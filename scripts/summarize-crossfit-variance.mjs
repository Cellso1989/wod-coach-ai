import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const distribution = (values) => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  return {
    count: a.length,
    p50Ms: a.length ? a[Math.ceil(a.length * 0.5) - 1] : null,
    p95Ms: a.length ? a[Math.ceil(a.length * 0.95) - 1] : null,
    maxMs: a.at(-1) ?? null,
  };
};
export function summarizeCrossfitVariance(rows) {
  const group = (entries) => ({
    generations: entries.length,
    accepted: entries.filter((x) => x.success).length,
    failed: entries.filter((x) => !x.success).length,
    retried: entries.filter((x) => x.attempts.length > 1).length,
    providerCalls: entries.reduce((s, x) => s + x.attempts.length, 0),
    allLatency: distribution(entries.map((x) => x.durationMs)),
    acceptedLatency: distribution(entries.filter((x) => x.success).map((x) => x.durationMs)),
    tokens: entries
      .flatMap((x) => x.attempts)
      .reduce(
        (sum, x) => {
          for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningTokens'])
            sum[key] += x.usage?.[key] ?? 0;
          return sum;
        },
        { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 },
      ),
    rejectedReasons: entries
      .flatMap((x) => x.validations)
      .filter((x) => x.status === 'rejected')
      .reduce((s, x) => {
        s[x.reason ?? 'unknown'] = (s[x.reason ?? 'unknown'] ?? 0) + 1;
        return s;
      }, {}),
  });
  const byRouting = Object.fromEntries(
    ['default', 'stable'].map((routing) => {
      const entries = rows.filter((x) => x.routing === routing);
      return [
        routing,
        {
          ...group(entries),
          byFixture: Object.fromEntries(
            [...new Set(entries.map((x) => x.fixture))].map((fixture) => [
              fixture,
              group(entries.filter((x) => x.fixture === fixture)),
            ]),
          ),
        },
      ];
    }),
  );
  return {
    schemaVersion: 1,
    synthetic: true,
    productionChange: 'none',
    recommendation: 'keep_default_routing',
    limitations: [
      'Three repetitions per fixture and routing; descriptive percentiles only.',
      'Fixed order alternates routing but shared-prefix cache can carry between trials.',
      'Automatic validity does not establish coaching quality.',
      'Failed generations and correction attempts included.',
    ],
    byRouting,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(JSON.stringify(summarizeCrossfitVariance(data.rows), null, 2) + '\n');
}
