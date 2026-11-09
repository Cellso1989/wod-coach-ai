import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
import * as Sentry from '../../apps/api/node_modules/@sentry/node';
import { registerExternalMonitoring } from '../../apps/api/src/services/external-monitoring.js';
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
describe('Sentry actual transport boundary', () => {
  it('sends an allowlisted HTTP failure to a local collector without request or athlete content', async () => {
    const envelopes: string[] = [];
    const collector = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      envelopes.push(Buffer.concat(chunks).toString());
      res.writeHead(200);
      res.end('{}');
    });
    await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
    const address = collector.address();
    if (!address || typeof address === 'string') throw Error('Fixture collector unavailable');
    vi.stubEnv('SENTRY_DSN', `http://public@127.0.0.1:${address.port}/1`);
    const app = requireApi('fastify')();
    try {
      registerExternalMonitoring(app);
      app.post(
        '/api/wods/:id/strategy',
        async (
          _request: unknown,
          reply: { code: (status: number) => { send: (body: unknown) => unknown } },
        ) => reply.code(502).send({ error: 'private response' }),
      );
      await app.inject({
        method: 'POST',
        url: '/api/wods/private-athlete-id/strategy?secret=private-query',
        headers: { authorization: 'Bearer private-token', cookie: 'session=private-cookie' },
        payload: { prompt: 'private-prompt', image: 'private-photo' },
      });
      await Sentry.flush(2000);
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]).toContain('WOD Coach HTTP_FAILURE');
      expect(envelopes[0]).toContain('/api/wods/:id/strategy');
      expect(envelopes[0]).not.toMatch(
        /private-|authorization|cookie|prompt|photo|request|user|breadcrumbs|contexts/,
      );
    } finally {
      await app.close();
      await Sentry.close(2000);
      vi.unstubAllEnvs();
      await new Promise<void>((resolve, reject) =>
        collector.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 10_000);
});
