import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
const sdk = vi.hoisted(() => ({
  getBucket: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../../apps/api/node_modules/@supabase/supabase-js', () => ({ createClient: sdk.create }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('WOD_IMAGE_STORAGE', 'supabase');
  vi.stubEnv('SUPABASE_URL', 'https://storage.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
  sdk.create.mockReturnValue({
    storage: {
      getBucket: sdk.getBucket,
      from: () => ({ upload: sdk.upload, download: sdk.download, remove: sdk.remove }),
    },
  });
  sdk.getBucket.mockResolvedValue({ data: { public: false }, error: null });
  sdk.upload.mockResolvedValue({ error: null });
  sdk.remove.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
const bytes = Buffer.from('fixture-image');
describe('private immutable workout images', () => {
  it('stores binary without overwrite and restores verified bytes scoped to the account and WOD', async () => {
    const { storeWodImage, readWodImage, deleteWodImage } =
      await import('../../apps/api/src/services/wod-image-storage.js');
    const ref = await storeWodImage('owner', 'wod', bytes, 'image/png');
    expect(ref).toMatchObject({
      imageData: null,
      imageMimeType: 'image/png',
      imageSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(ref.imageStorageKey).toMatch(/^owner\/wod\/[a-f0-9-]+$/);
    expect(sdk.upload).toHaveBeenCalledWith(ref.imageStorageKey, bytes, {
      contentType: 'image/png',
      upsert: false,
      cacheControl: '0',
    });
    sdk.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    expect(await readWodImage({ id: 'wod', userId: 'owner', ...ref })).toEqual(bytes);
    await deleteWodImage({ id: 'wod', userId: 'owner', ...ref });
    expect(sdk.remove).toHaveBeenCalledWith([ref.imageStorageKey]);
  });
  it('rejects public buckets, corrupt content, traversal and another owner before disclosing bytes', async () => {
    const { storeWodImage, readWodImage } =
      await import('../../apps/api/src/services/wod-image-storage.js');
    sdk.getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    await expect(storeWodImage('owner', 'wod', bytes, 'image/png')).rejects.toThrow(
      'Nao foi possivel',
    );
    expect(sdk.upload).not.toHaveBeenCalled();
    const ref = await storeWodImage('owner', 'wod', bytes, 'image/png');
    await expect(readWodImage({ id: 'wod', userId: 'other', ...ref })).rejects.toThrow();
    expect(sdk.download).not.toHaveBeenCalled();
    await expect(
      readWodImage({
        id: 'wod',
        userId: 'owner',
        ...ref,
        imageStorageKey: 'owner/wod/../../other',
      }),
    ).rejects.toThrow();
    sdk.download.mockResolvedValue({ data: new Blob(['corrupt']), error: null });
    await expect(readWodImage({ id: 'wod', userId: 'owner', ...ref })).rejects.toThrow();
  });
  it('keeps legacy database photos readable without external credentials', async () => {
    vi.stubEnv('WOD_IMAGE_STORAGE', 'database');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { storeWodImage, readWodImage } =
      await import('../../apps/api/src/services/wod-image-storage.js');
    const ref = await storeWodImage('owner', 'wod', bytes, 'image/png');
    expect(await readWodImage({ id: 'wod', userId: 'owner', ...ref })).toEqual(bytes);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it('turns SDK/network errors into a bounded opaque error', async () => {
    const { storeWodImage } = await import('../../apps/api/src/services/wod-image-storage.js');
    sdk.upload.mockRejectedValue(Error('secret network details'));
    await expect(storeWodImage('owner', 'wod', bytes, 'image/png')).rejects.toThrow(
      'Nao foi possivel',
    );
  });
});
