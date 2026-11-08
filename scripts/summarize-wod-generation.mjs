import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const OPERATIONS = ['ANALYSIS', 'STRATEGY'];
const EVENTS = new Set([
  'wod_generation_timing',
  'wod_generation_http_timing',
  'wod_generation_client_timing',
]);

export function parseLogLine(line) {
  try {
    const record = JSON.parse(line.slice(line.indexOf('{')));
    if (EVENTS.has(record.event)) return record;
    // Some exports wrap the original Pino JSON in a message string.
    if (typeof record.message === 'string' && record.message.includes('{')) {
      const nested = JSON.parse(record.message.slice(record.message.indexOf('{')));
      if (EVENTS.has(nested.event)) return nested;
    }
  } catch {
    /* Non-JSON deployment output is not a measurement. */
  }
  return null;
}

function distribution(values) {
  const sorted = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const percentile = (p) => (sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null);
  return {
    count: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}

const identity = (row) =>
  (row.instanceId && row.requestId ? `${row.instanceId}:${row.requestId}` : null) ||
  row.measurementId;
const ratio = (numerator, denominator) => ({
  numerator,
  denominator,
  percent: denominator ? (100 * numerator) / denominator : null,
});

export function summarizeWodGenerationLogs(records) {
  const seen = new Set();
  let duplicatesIgnored = 0;
  let legacyWorkEventsExcluded = 0;
  const rows = records.filter((row) => {
    if (!row || !EVENTS.has(row.event) || !OPERATIONS.includes(row.operation)) return false;
    if (row.event === 'wod_generation_timing' && row.schemaVersion !== 2) {
      legacyWorkEventsExcluded++;
      return false;
    }
    const id = identity(row);
    if (id) {
      const key = `${row.event}:${row.operation}:${id}`;
      if (seen.has(key)) {
        duplicatesIgnored++;
        return false;
      }
      seen.add(key);
    }
    return true;
  });
  const groups = [];
  for (const operation of OPERATIONS) {
    const work = rows.filter(
      (r) => r.operation === operation && r.event === 'wod_generation_timing',
    );
    const http = rows.filter(
      (r) => r.operation === operation && r.event === 'wod_generation_http_timing',
    );
    const client = rows.filter(
      (r) => r.operation === operation && r.event === 'wod_generation_client_timing',
    );
    const summarizeWork = (entries) => {
      const started = entries.filter((r) => r.attempts?.length > 0);
      const corrections = started.filter((r) => r.aiSummary?.correctionAttempted);
      const rejected = started
        .flatMap((r) => r.validations ?? [])
        .filter((v) => v.status === 'rejected');
      const attempts = started.flatMap((r) => r.attempts);
      const knownUsage = attempts.flatMap((a) => (a.usage ? [a.usage] : []));
      const knownSum = (key) =>
        knownUsage.reduce((sum, usage) => sum + (Number.isFinite(usage[key]) ? usage[key] : 0), 0);
      const reasons = {};
      for (const event of rejected) {
        const reason = event.reason ?? 'unknown';
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      const fields = {};
      for (const event of rejected) {
        for (const issue of event.issues ?? []) {
          const key = `${issue.field}:${issue.code}`;
          fields[key] = (fields[key] ?? 0) + 1;
        }
      }
      const stages = {};
      for (const stage of [
        'sourceRead',
        'analysisRead',
        'context',
        'profile',
        'ai',
        'persistence',
      ]) {
        stages[stage] = distribution(entries.map((r) => r.stages?.[stage]));
      }
      const databaseOperations = {};
      const databaseCalls = entries.flatMap((r) => r.databaseOperations ?? []);
      for (const name of [...new Set(databaseCalls.map((call) => call.operation))].sort()) {
        const calls = databaseCalls.filter((call) => call.operation === name);
        databaseOperations[name] = {
          ...distribution(calls.map((call) => call.durationMs)),
          failures: calls.filter((call) => call.status === 'failed').length,
        };
      }
      return {
        routeWork: distribution(entries.map((r) => r.durationMs)),
        routeWorkWithCorrection: distribution(corrections.map((r) => r.durationMs)),
        routeWorkWithoutCorrection: distribution(
          started.filter((r) => !r.aiSummary?.correctionAttempted).map((r) => r.durationMs),
        ),
        routeFailures: entries.filter((r) => r.outcome === 'failed').length,
        aiStarted: started.length,
        correctionRate: ratio(corrections.length, started.length),
        correctionRecoveryRate: ratio(
          corrections.filter((r) => r.aiSummary?.corrected).length,
          corrections.length,
        ),
        persistedAfterCorrection: corrections.filter(
          (r) => r.aiSummary?.corrected && r.outcome === 'succeeded',
        ).length,
        rejectedResponses: rejected.length,
        rejectionReasons: reasons,
        rejectionFields: fields,
        validation: distribution(
          started.flatMap((r) => r.validations ?? []).map((v) => v.durationMs),
        ),
        providerAttempts: distribution(attempts.map((a) => a.durationMs)),
        failedProviderAttempts: attempts.filter((a) => a.status === 'failed').length,
        tokenUsage: {
          attemptsWithUsage: knownUsage.length,
          attemptsWithoutUsage: attempts.length - knownUsage.length,
          knownInputTokens: knownSum('inputTokens'),
          knownOutputTokens: knownSum('outputTokens'),
          knownReasoningTokens: knownSum('reasoningTokens'),
          knownCachedInputTokens: knownSum('cachedInputTokens'),
          attemptsWithReasoningDetails: knownUsage.filter((u) => Number.isFinite(u.reasoningTokens))
            .length,
          attemptsWithCacheDetails: knownUsage.filter((u) => Number.isFinite(u.cachedInputTokens))
            .length,
        },
        stages,
        databaseOperations,
      };
    };
    const httpById = new Map(http.filter(identity).map((r) => [identity(r), r]));
    const httpByMeasurement = new Map();
    for (const row of http) {
      if (!row.measurementId) continue;
      const group = httpByMeasurement.get(row.measurementId) ?? [];
      group.push(row);
      httpByMeasurement.set(row.measurementId, group);
    }
    const matchedWork = work.flatMap((w) => {
      const server = httpById.get(identity(w));
      return server ? [{ work: w, server }] : [];
    });
    const matched = client.flatMap((c) => {
      const candidates = httpByMeasurement.get(c.measurementId);
      const server = candidates?.length === 1 ? candidates[0] : null;
      return server ? [{ client: c, server }] : [];
    });
    groups.push({
      operation,
      ...summarizeWork(work),
      bySource: Object.fromEntries(
        [...new Set(work.map((r) => r.sourceType ?? 'unknown'))].map((source) => [
          source,
          summarizeWork(work.filter((r) => (r.sourceType ?? 'unknown') === source)),
        ]),
      ),
      byConfiguration: Object.fromEntries(
        [
          ...new Set(
            work.map((r) => {
              const a = r.attempts?.[0];
              return `${a?.requestedModel ?? 'unknown'}|${a?.requestedReasoningEffort ?? 'unknown'}|${a?.promptVersion ?? 'unknown'}`;
            }),
          ),
        ].map((configuration) => [
          configuration,
          summarizeWork(
            work.filter((r) => {
              const a = r.attempts?.[0];
              return (
                `${a?.requestedModel ?? 'unknown'}|${a?.requestedReasoningEffort ?? 'unknown'}|${a?.promptVersion ?? 'unknown'}` ===
                configuration
              );
            }),
          ),
        ]),
      ),
      http: distribution(http.map((r) => r.durationMs)),
      httpFailures: http.filter((r) => r.outcome === 'failed').length,
      matchedHttpWork: matchedWork.length,
      httpMinusWork: distribution(
        matchedWork.map(({ work: w, server: s }) => s.durationMs - w.durationMs),
      ),
      client: distribution(client.map((r) => r.durationMs)),
      clientFailures: client.filter((r) => r.outcome === 'failed').length,
      matchedClientHttp: matched.length,
      ambiguousMeasurementIds: [...httpByMeasurement.values()].filter((group) => group.length > 1)
        .length,
      // Not pure network latency: includes proxy/startup/body parsing and clock noise.
      clientMinusHttp: distribution(
        matched.map(({ client: c, server: s }) => c.durationMs - s.durationMs),
      ),
      negativeClientMinusHttp: matched.filter(
        ({ client: c, server: s }) => c.durationMs < s.durationMs,
      ).length,
    });
  }
  return { schemaVersion: 1, duplicatesIgnored, legacyWorkEventsExcluded, groups };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    process.stderr.write(
      'Usage: node scripts/summarize-wod-generation.mjs <logs.jsonl> [more.jsonl]\n',
    );
    process.exitCode = 1;
  } else {
    const records = [];
    let ignoredLines = 0;
    for (const file of files) {
      const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
      for await (const line of lines) {
        const record = parseLogLine(line);
        if (record) records.push(record);
        else ignoredLines++;
      }
    }
    if (!records.length) {
      process.stderr.write(
        'No telemetry events found. Check the export window and UTF-8 JSONL encoding.\n',
      );
      process.exitCode = 2;
    }
    process.stdout.write(
      `${JSON.stringify({ input: { fileCount: files.length, parsedEvents: records.length, ignoredLines }, ...summarizeWodGenerationLogs(records) }, null, 2)}\n`,
    );
  }
}
