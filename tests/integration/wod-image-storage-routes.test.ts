import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createHmac } from 'node:crypto';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  remove: vi.fn(),
  version: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  storageRemove: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock('../../packages/database/dist/index.js', async (original) => ({
  ...(await original<typeof import('@wod-coach-ai/database')>()),
  prisma: {
    user: { findUnique: async () => ({ accessStatus: 'APPROVED' }) },
    wod: { create: mocks.create, findFirst: mocks.find, delete: mocks.remove },
    wodAnalysisVersion: { findFirst: mocks.version },
    wodStrategyVersion: { findFirst: mocks.version },
    $disconnect: async () => {},
  },
}));
vi.mock('../../apps/api/node_modules/@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      getBucket: mocks.bucket,
      from: () => ({ upload: mocks.upload, download: mocks.download, remove: mocks.storageRemove }),
    },
  }),
}));
const sign = (sub: string) => {
  const data = [{ alg: 'HS256', typ: 'JWT' }, { sub }]
    .map((x) => Buffer.from(JSON.stringify(x)).toString('base64url'))
    .join('.');
  return `${data}.${createHmac('sha256', process.env.JWT_SECRET!).update(data).digest('base64url')}`;
};
let app: ReturnType<typeof buildApp>;
let row: Record<string, unknown> | null;
const bytes = Buffer.from('private-image-fixture');
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('WOD_IMAGE_STORAGE', 'supabase');
  vi.stubEnv('SUPABASE_URL', 'https://storage.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
  row = null;
  mocks.bucket.mockResolvedValue({ data: { public: false }, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  mocks.create.mockImplementation(async ({ data }) => {
    row = { ...data };
    return { id: data.id, sourceType: data.sourceType };
  });
  mocks.find.mockImplementation(async ({ where }) =>
    row && where.id === row.id && where.userId === row.userId ? row : null,
  );
  mocks.version.mockImplementation(async ({ where }) =>
    row && where.wodId === row.id && where.id === 'version' && where.wod.userId === row.userId
      ? { sourceSnapshot: { ...row } }
      : null,
  );
  app = buildApp({ backgroundTasks: false });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});
async function upload() {
  const boundary = 'storage-fixture';
  return app.inject({
    method: 'POST',
    url: '/api/wods',
    headers: {
      authorization: `Bearer ${sign('owner')}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="wod.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
}
describe('external image API contracts', () => {
  it('serves current and archived bytes only through account-authenticated no-store endpoints', async () => {
    const created = await upload();
    expect(created.statusCode).toBe(201);
    const id = created.json().wod.id;
    expect(row).toMatchObject({ imageData: null, imageMimeType: 'image/png' });
    expect(row!.imageStorageKey).toBeTruthy();
    const headers = { authorization: `Bearer ${sign('owner')}` };
    for (const path of [
      `/api/wods/${id}/image`,
      `/api/wods/${id}/versions/analysis/version/image`,
      `/api/wods/${id}/versions/strategy/version/image`,
    ]) {
      const response = await app.inject({ method: 'GET', url: path, headers });
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(bytes);
      expect(response.headers['cache-control']).toBe('private, no-store');
      const other = await app.inject({
        method: 'GET',
        url: path,
        headers: { authorization: `Bearer ${sign('other')}` },
      });
      expect(other.statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
    }
    const detail = (await app.inject({ method: 'GET', url: `/api/wods/${id}`, headers })).json()
      .wod;
    expect(detail.imageData).toBe(bytes.toString('base64'));
    expect(detail).not.toHaveProperty('imageStorageKey');
    expect(detail).not.toHaveProperty('imageSha256');
    await app.inject({ method: 'DELETE', url: `/api/wods/${id}`, headers });
    expect(mocks.storageRemove).toHaveBeenCalledWith([row!.imageStorageKey]);
  });
  it('compensates an uploaded object if database creation fails and hides storage network errors', async () => {
    mocks.create.mockRejectedValueOnce(Error('DB failed'));
    expect((await upload()).statusCode).toBe(500);
    expect(mocks.storageRemove).toHaveBeenCalledTimes(1);
    mocks.upload.mockRejectedValueOnce(Error('private credentials in upstream failure'));
    const response = await upload();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('credentials');
  });
  it('preserves a committed photo when the database acknowledgement is lost', async () => {
    mocks.create.mockImplementationOnce(async ({ data }) => {
      row = { ...data };
      throw Error('acknowledgement lost');
    });
    expect((await upload()).statusCode).toBe(500);
    expect(row!.imageStorageKey).toBeTruthy();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });
});
