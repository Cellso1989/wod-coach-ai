import { describe, it, expect } from 'vitest';
import { sanitizeMonitoringEvent } from '../../apps/api/src/services/external-monitoring.js';

describe('external monitoring privacy boundary', () => {
  it('rebuilds the entire event, dropping automatic scope, prompts, SQL and identity', () => {
    const event = sanitizeMonitoringEvent({
      message: 'secret prompt',
      request: { url: '/private?token=secret', cookies: { session: 'private' } },
      user: { email: 'athlete@example.test' },
      exception: { values: [{ value: 'private response' }] },
      breadcrumbs: [{ message: 'SELECT private' }],
      contexts: { private: { image: 'base64' } },
      tags: {
        code: 'HTTP_FAILURE',
        route: '/api/wods/:id/strategy',
        statusCode: '502',
        athlete: 'private',
      },
      extra: { durationMs: 1234.8, prompt: 'private' },
      release: 'abcdef0123456789',
    });
    expect(event).toEqual({
      type: undefined,
      event_id: undefined,
      timestamp: undefined,
      message: 'WOD Coach HTTP_FAILURE',
      platform: 'node',
      level: 'error',
      tags: { code: 'HTTP_FAILURE', route: '/api/wods/:id/strategy', statusCode: '502' },
      extra: { durationMs: 1235 },
      release: 'abcdef0123456789',
    });
    expect(JSON.stringify(event)).not.toMatch(/secret|private|athlete|SELECT|base64/);
  });
  it('drops unapproved events and unrecognized route names instead of passing scope through', () => {
    expect(sanitizeMonitoringEvent({ message: 'private' })).toBeNull();
    expect(
      sanitizeMonitoringEvent({
        tags: { code: 'SLOW_REQUEST', route: '/api/wods/private-id', statusCode: 'invalid' },
        extra: { durationMs: -1 },
        release: 'private',
      }),
    ).toMatchObject({ tags: { code: 'SLOW_REQUEST' }, extra: {} });
  });
});
