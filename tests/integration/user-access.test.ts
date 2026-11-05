import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { recordUserAccess } from '../../apps/api/src/services/access-log.js';

const db = vi.hoisted(() => {
  type User = {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    accessStatus: 'PENDING' | 'APPROVED' | 'BLOCKED';
    isAdmin: boolean;
    lastAccessAt?: Date | null;
  };
  const users = new Map<string, User>();
  const audits: Record<string, unknown>[] = [];
  const logs: Record<string, unknown>[] = [];
  return {
    users,
    audits,
    logs,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id
          ? (users.get(where.id) ?? null)
          : ([...users.values()].find((u) => u.email === where.email) ?? null),
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) =>
        users.get(where.id)!,
      ),
      create: vi.fn(async ({ data }: { data: Omit<User, 'id' | 'accessStatus' | 'isAdmin'> }) => {
        const user: User = {
          ...data,
          id: '33333333-3333-4333-8333-333333333333',
          accessStatus: 'PENDING',
          isAdmin: false,
        };
        users.set(user.id, user);
        return user;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        const user = { ...users.get(where.id)!, ...data };
        users.set(user.id, user);
        return user;
      }),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async ({ where, data }) => {
        const user = users.get(where.id);
        if (!user || user.accessStatus !== where.accessStatus) return { count: 0 };
        if (where.OR && user.lastAccessAt && user.lastAccessAt > where.OR[1].lastAccessAt.lte)
          return { count: 0 };
        users.set(user.id, { ...user, ...data });
        return { count: 1 };
      }),
    },
    logCreate: vi.fn(async ({ data }) => {
      logs.push(data);
      return data;
    }),
    logFindMany: vi.fn(async () => [] as Record<string, unknown>[]),
    auditCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      audits.push(data);
      return data;
    }),
  };
});

vi.mock('../../packages/database/dist/index.js', async (original) => {
  const tx = {
    user: db.user,
    userAccessAudit: { create: db.auditCreate },
    userAccessLog: { create: db.logCreate, findMany: db.logFindMany },
  };
  const empty = { findMany: async () => [] };
  return {
    ...(await original<typeof import('@wod-coach-ai/database')>()),
    prisma: {
      ...tx,
      userAccessAudit: { create: db.auditCreate, findMany: async () => db.audits },
      wod: empty,
      wodAnalysis: empty,
      wodStrategy: empty,
      hyroxStrategy: empty,
      wodResult: empty,
      dailyCheckin: empty,
      personalRecord: empty,
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
        const snapshot = new Map(db.users);
        const count = db.audits.length;
        const logCount = db.logs.length;
        try {
          return await work(tx);
        } catch (error) {
          db.users.clear();
          for (const [id, user] of snapshot) db.users.set(id, user);
          db.audits.length = count;
          db.logs.length = logCount;
          throw error;
        }
      },
      $disconnect: vi.fn(),
    },
  };
});

describe('user approval and administrator authorization', () => {
  let app: ReturnType<typeof buildApp>;
  const adminId = '11111111-1111-4111-8111-111111111111';
  const athleteId = '22222222-2222-4222-8222-222222222222';
  const credentials = { email: 'athlete@example.test', password: 'correct-password' };
  const headers = (id: string) => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { sub: id }]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    return {
      authorization: `Bearer ${unsigned}.${createHmac('sha256', process.env.JWT_SECRET!).update(unsigned).digest('base64url')}`,
    };
  };
  const change = (id = athleteId, status = 'APPROVED', actor = adminId) =>
    app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${id}/access`,
      headers: headers(actor),
      payload: { status },
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    db.users.clear();
    db.audits.length = 0;
    db.logs.length = 0;
    db.logFindMany.mockResolvedValue([]);
    // bcrypt hash of the public test password "correct-password" (cost 4).
    const passwordHash = '$2a$04$.7pz4BmlMXjq9ZnanWYM2e1RWTc7rqjfksptyeL9jJYIBJoz5dNRi';
    db.users.set(adminId, {
      id: adminId,
      email: 'owner@example.test',
      name: 'Owner',
      passwordHash,
      accessStatus: 'APPROVED',
      isAdmin: true,
    });
    db.users.set(athleteId, {
      id: athleteId,
      email: credentials.email,
      name: 'Athlete',
      passwordHash,
      accessStatus: 'PENDING',
      isAdmin: false,
    });
    app = buildApp();
    await app.ready();
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await app.close();
  });

  it('registers pending without a session and ignores forged privileges, including the old admin email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Fake owner',
        email: 'celso.sabino1989@gmail.com',
        password: credentials.password,
        isAdmin: true,
        accessStatus: 'APPROVED',
        role: 'admin',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.json().user).toMatchObject({ accessStatus: 'PENDING', isAdmin: false });
    expect(response.json().user.passwordHash).toBeUndefined();
    expect(db.user.create.mock.calls[0]![0].data).not.toHaveProperty('isAdmin');
  });

  it.each(['PENDING', 'BLOCKED'] as const)(
    'denies %s login without issuing a cookie',
    async (status) => {
      db.users.get(athleteId)!.accessStatus = status;
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: credentials,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('ACCESS_DENIED');
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('checks the password before disclosing access status', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...credentials, password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('approves, allows login, blocks an existing token on the next request, then restores access', async () => {
    expect((await change()).statusCode).toBe(200);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: credentials,
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const session = headers(athleteId);
    expect((await app.inject({ url: '/api/auth/me', headers: session })).statusCode).toBe(200);
    expect((await change(athleteId, 'BLOCKED')).statusCode).toBe(200);
    const denied = await app.inject({ url: '/api/auth/me', headers: session });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['set-cookie']).toContain('Max-Age=0');
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(403);
    expect(db.audits).toEqual([
      expect.objectContaining({
        actorId: adminId,
        targetId: athleteId,
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
      }),
      expect.objectContaining({ fromStatus: 'APPROVED', toStatus: 'BLOCKED' }),
    ]);
    expect((await change()).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: session })).statusCode).toBe(200);
  });

  it.each([
    '/api/wods',
    '/api/hyrox-workouts',
    '/api/athlete-profile',
    '/api/checkins',
    '/api/personal-records',
    '/api/ranking/monthly',
    '/api/notifications',
    '/api/admin/users',
  ])('rejects a blocked account before the protected handler: %s', async (url) => {
    db.users.get(athleteId)!.accessStatus = 'BLOCKED';
    const response = await app.inject({ url, headers: headers(athleteId) });
    expect(response.statusCode).toBe(403);
  });

  it.each([
    '/api/wods/test/analyze',
    '/api/wods/test/strategy',
    '/api/hyrox-workouts/test/analyze',
    '/api/hyrox-workouts/test/strategy',
    '/api/hyrox/strategy',
  ])('rejects blocked accounts before generating AI content: %s', async (url) => {
    db.users.get(athleteId)!.accessStatus = 'BLOCKED';
    expect(
      (await app.inject({ method: 'POST', url, headers: headers(athleteId), payload: {} }))
        .statusCode,
    ).toBe(403);
  });

  it('denies a pending account even with a correctly signed token', async () => {
    expect((await app.inject({ url: '/api/wods', headers: headers(athleteId) })).statusCode).toBe(
      403,
    );
  });

  it('rejects anonymous, deleted and forged sessions', async () => {
    expect((await app.inject({ url: '/api/admin/users' })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: headers('deleted') })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { authorization: 'Bearer forged' } }))
        .statusCode,
    ).toBe(401);
  });

  it('denies an approved athlete both administrative reads and writes, regardless of ADMIN_EMAILS', async () => {
    db.users.get(athleteId)!.accessStatus = 'APPROVED';
    vi.stubEnv('ADMIN_EMAILS', credentials.email);
    expect(
      (await app.inject({ url: '/api/admin/users', headers: headers(athleteId) })).statusCode,
    ).toBe(403);
    expect((await change(athleteId, 'BLOCKED', athleteId)).statusCode).toBe(403);
    expect(db.audits).toHaveLength(0);
  });

  it('keeps administrator identity bound to its account and exposes audit only to administrators', async () => {
    db.users.get(adminId)!.email = 'renamed-owner@example.test';
    const response = await app.inject({ url: '/api/admin/users', headers: headers(adminId) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ users: [], accessHistory: [] });
    expect((await change(adminId, 'BLOCKED')).statusCode).toBe(403);
    expect((await change(adminId, 'APPROVED')).statusCode).toBe(403);
  });

  it('does not duplicate the audit for an unchanged status', async () => {
    await change();
    await change();
    expect(db.audits).toHaveLength(1);
  });

  it('does not change status if recording the audit fails', async () => {
    db.auditCreate.mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await change()).statusCode).toBe(500);
    expect(db.users.get(athleteId)!.accessStatus).toBe('PENDING');
    expect(db.audits).toHaveLength(0);
  });

  it('reports a concurrent update conflict without changing access', async () => {
    db.auditCreate.mockRejectedValueOnce({ code: 'P2034' });
    expect((await change()).statusCode).toBe(409);
    expect(db.users.get(athleteId)!.accessStatus).toBe('PENDING');
  });

  it.each(['PENDING', 'ADMIN', 'admin', 'invalid'])(
    'rejects invalid transition %s',
    async (status) => {
      expect((await change(athleteId, status)).statusCode).toBe(400);
    },
  );

  it('rejects malformed IDs, missing users and extra privilege fields', async () => {
    expect((await change('invalid')).statusCode).toBe(400);
    expect((await change('44444444-4444-4444-8444-444444444444')).statusCode).toBe(404);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${athleteId}/access`,
      headers: headers(adminId),
      payload: { status: 'APPROVED', isAdmin: true },
    });
    expect(response.statusCode).toBe(400);
  });

  it('records successful logins including repeated logins, but not invalid credentials or denied accounts', async () => {
    for (const status of ['PENDING', 'BLOCKED', 'APPROVED'] as const) {
      db.users.get(athleteId)!.accessStatus = status;
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
    }
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...credentials, password: 'wrong' },
    });
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
    expect(db.logs).toHaveLength(2);
    expect(db.logs[0]).toEqual({ userId: athleteId, kind: 'LOGIN', createdAt: expect.any(Date) });
    expect(db.users.get(athleteId)!.lastAccessAt).toBeInstanceOf(Date);
  });

  it('tracks existing sessions on reopening, skips reloads within 30 minutes, and keeps users independent', async () => {
    db.users.get(athleteId)!.accessStatus = 'APPROVED';
    await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    expect(db.logs).toHaveLength(1);
    db.users.get(athleteId)!.lastAccessAt = new Date(Date.now() - 31 * 60 * 1000);
    await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    await app.inject({ url: '/api/auth/me', headers: headers(adminId) });
    expect(db.logs.map((entry) => [entry.userId, entry.kind])).toEqual([
      [athleteId, 'SESSION_RETURN'],
      [athleteId, 'SESSION_RETURN'],
      [adminId, 'SESSION_RETURN'],
    ]);
  });

  it('does not record ordinary protected requests or a session check immediately after login', async () => {
    db.users.get(athleteId)!.accessStatus = 'APPROVED';
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
    const response = await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().user).not.toHaveProperty('lastAccessAt');
    await app.inject({ url: '/api/admin/users', headers: headers(adminId) });
    expect(db.logs).toHaveLength(1);
  });

  it('rolls back the access timestamp if the log fails and still allows authentication and a later retry', async () => {
    db.users.get(athleteId)!.accessStatus = 'APPROVED';
    db.logCreate.mockRejectedValueOnce(new Error('storage unavailable'));
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: credentials,
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(db.users.get(athleteId)!.lastAccessAt).toBeUndefined();
    expect(db.logs).toHaveLength(0);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: headers(athleteId) })).statusCode,
    ).toBe(200);
    expect(db.logs).toHaveLength(1);
  });

  it('protects the access log from anonymous, pending, blocked and non-admin users', async () => {
    const url = '/api/admin/access-logs';
    expect((await app.inject({ url })).statusCode).toBe(401);
    for (const status of ['PENDING', 'BLOCKED', 'APPROVED'] as const) {
      db.users.get(athleteId)!.accessStatus = status;
      expect((await app.inject({ url, headers: headers(athleteId) })).statusCode).toBe(403);
    }
    expect(db.logFindMany).not.toHaveBeenCalled();
    expect(db.logs).toHaveLength(0);
  });

  it('lists only the requested user with stable newest-first pagination and private cache headers', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: `event-${i}` }));
    db.logFindMany.mockResolvedValueOnce(rows);
    const response = await app.inject({
      url: `/api/admin/access-logs?userId=${athleteId}&before=${adminId}`,
      headers: headers(adminId),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ logs: rows.slice(0, 50), nextCursor: 'event-49' });
    expect(db.logFindMany).toHaveBeenCalledWith({
      where: { userId: athleteId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      cursor: { id: adminId },
      skip: 1,
      select: {
        id: true,
        userId: true,
        kind: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    expect(
      (await app.inject({ url: '/api/admin/access-logs', headers: headers(adminId) })).json(),
    ).toEqual({ logs: [], nextCursor: null });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it.each(['userId=bad', 'before=bad', 'limit=100000', 'userId[]=bad'])(
    'rejects invalid access-log filters: %s',
    async (query) => {
      expect(
        (await app.inject({ url: `/api/admin/access-logs?${query}`, headers: headers(adminId) }))
          .statusCode,
      ).toBe(400);
      expect(db.logFindMany).not.toHaveBeenCalled();
    },
  );

  it('selects last recorded access for the admin list without returning password hashes', async () => {
    await app.inject({ url: '/api/admin/users', headers: headers(adminId) });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          email: true,
          accessStatus: true,
          isAdmin: true,
          createdAt: true,
          lastAccessAt: true,
        },
      }),
    );
  });

  it('enforces the exact 30-minute boundary and avoids writes while within the interval', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-11-05T15:00:00Z');
    vi.setSystemTime(start);
    db.users.get(athleteId)!.accessStatus = 'APPROVED';
    await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(start.getTime() + 30 * 60 * 1000 - 1));
    await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    expect(db.users.get(athleteId)!.lastAccessAt).toEqual(start);
    vi.setSystemTime(new Date(start.getTime() + 30 * 60 * 1000));
    await app.inject({ url: '/api/auth/me', headers: headers(athleteId) });
    expect(db.logs).toHaveLength(2);
  });

  it('rechecks eligibility and deduplication in the database even when callers have stale user reads', async () => {
    db.users.get(athleteId)!.accessStatus = 'APPROVED';
    const stale = { id: athleteId, lastAccessAt: null };
    await Promise.all(
      Array.from({ length: 8 }, () => recordUserAccess(stale, 'SESSION_RETURN', app.log)),
    );
    expect(db.logs).toHaveLength(1);
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: athleteId,
          accessStatus: 'APPROVED',
          OR: [{ lastAccessAt: null }, { lastAccessAt: { lte: expect.any(Date) } }],
        },
      }),
    );
    db.users.get(athleteId)!.accessStatus = 'BLOCKED';
    await recordUserAccess(stale, 'LOGIN', app.log);
    expect(db.logs).toHaveLength(1);
  });
});
