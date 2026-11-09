import * as Sentry from '@sentry/node';
import type { FastifyInstance } from 'fastify';

const ROUTES = new Set([
  '/api/wods/:id/analyze',
  '/api/wods/:id/strategy',
  '/api/wod-generation-jobs/:id',
  '/api/wods/:id/image',
  '/api/wods/:id/versions/:kind/:versionId/image',
]);
const CODES = new Set(['HTTP_FAILURE', 'SLOW_REQUEST', 'WORKER_FAILURE']);
let enabled = false;
/** Reconstruct the event from an allowlist, including events produced by dependencies. */
export function sanitizeMonitoringEvent(event: Sentry.Event): Sentry.ErrorEvent | null {
  const code = event.tags?.code;
  if (typeof code !== 'string' || !CODES.has(code)) return null;
  const route = event.tags?.route;
  const status = Number(event.tags?.statusCode);
  const duration = Number(event.extra?.durationMs);
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    message: `WOD Coach ${code}`,
    level: code === 'SLOW_REQUEST' ? 'warning' : 'error',
    platform: 'node',
    tags: {
      code,
      ...(typeof route === 'string' && ROUTES.has(route) ? { route } : {}),
      ...(Number.isInteger(status) && status >= 100 && status <= 599
        ? { statusCode: String(status) }
        : {}),
    },
    extra:
      Number.isFinite(duration) && duration >= 0
        ? { durationMs: Math.min(Math.round(duration), 30 * 60_000) }
        : {},
    ...(typeof event.release === 'string' && /^[a-f0-9]{7,40}$/.test(event.release)
      ? { release: event.release }
      : {}),
  };
}
export function initializeMonitoring() {
  if (enabled || !process.env.SENTRY_DSN) return;
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      defaultIntegrations: false,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
      },
      enableOpenTelemetrySetup: false,
      enableRuntimeChannelInjection: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
      beforeSendLog: () => null,
      beforeSendTransaction: () => null,
      beforeSendMetric: () => null,
      release: process.env.RENDER_GIT_COMMIT ?? process.env.APP_RELEASE,
      beforeSend: sanitizeMonitoringEvent,
    });
    enabled = true;
  } catch {
    enabled = false;
  }
}
export function reportWorkerFailure() {
  if (!enabled) return;
  try {
    Sentry.captureMessage('WOD Coach WORKER_FAILURE', {
      tags: { code: 'WORKER_FAILURE' },
      level: 'error',
    });
  } catch {
    /* Monitoring cannot affect work. */
  }
}
export function registerExternalMonitoring(app: FastifyInstance) {
  initializeMonitoring();
  const started = new WeakMap<object, number>();
  app.addHook('onRequest', async (request) => {
    if (enabled && ROUTES.has(request.routeOptions.url ?? ''))
      started.set(request, performance.now());
  });
  app.addHook('onResponse', async (request, reply) => {
    const start = started.get(request);
    if (start === undefined) return;
    started.delete(request);
    const durationMs = performance.now() - start;
    const code =
      reply.statusCode >= 500 ? 'HTTP_FAILURE' : durationMs >= 30_000 ? 'SLOW_REQUEST' : null;
    if (!code) return;
    try {
      Sentry.captureMessage(`WOD Coach ${code}`, {
        level: code === 'SLOW_REQUEST' ? 'warning' : 'error',
        tags: { code, route: request.routeOptions.url, statusCode: String(reply.statusCode) },
        extra: { durationMs },
      });
    } catch {
      /* Fail open for telemetry only. */
    }
  });
  app.addHook('onClose', async () => {
    if (enabled) await Sentry.flush(2000).catch(() => undefined);
  });
}
