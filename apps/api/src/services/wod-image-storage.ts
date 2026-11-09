import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { WOD_IMAGE_ALLOWED_MIME_TYPES, WOD_IMAGE_MAX_BYTES } from '@wod-coach-ai/validation';

export class WodImageStorageError extends Error {
  readonly statusCode = 503;
  constructor() {
    super('Nao foi possivel acessar a imagem do treino agora. Tente novamente.');
  }
}
type ImageSource = {
  id: string;
  userId: string;
  imageData?: string | null;
  imageMimeType?: string | null;
  imageStorageKey?: string | null;
  imageSha256?: string | null;
};
let cached: {
  url: string;
  key: string;
  bucket: string;
  client: ReturnType<typeof createClient>;
  checkedAt: number;
} | null = null;
function storage() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const bucket = process.env.WOD_IMAGE_BUCKET ?? 'wod-images';
  if (!/^https:\/\/[^/]+\/?$/.test(url) || !key || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket))
    throw new WodImageStorageError();
  if (!cached || cached.url !== url || cached.key !== key || cached.bucket !== bucket) {
    cached = {
      url,
      key,
      bucket,
      checkedAt: 0,
      client: createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
        },
      }),
    };
  }
  return cached;
}
export function externalWodImagesEnabled() {
  const mode = process.env.WOD_IMAGE_STORAGE ?? 'database';
  if (!['database', 'supabase'].includes(mode)) throw new WodImageStorageError();
  return mode === 'supabase';
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function store(userId: string, wodId: string, bytes: Buffer, mimeType: string) {
  if (
    !bytes.length ||
    bytes.length > WOD_IMAGE_MAX_BYTES ||
    !WOD_IMAGE_ALLOWED_MIME_TYPES.includes(mimeType)
  )
    throw new WodImageStorageError();
  if (!externalWodImagesEnabled())
    return {
      imageData: bytes.toString('base64'),
      imageMimeType: mimeType,
      imageStorageKey: null,
      imageSha256: null,
    };
  if (![userId, wodId].every((value) => /^[a-zA-Z0-9_-]+$/.test(value)))
    throw new WodImageStorageError();
  const config = storage();
  if (Date.now() - config.checkedAt > 5 * 60_000) {
    const { data, error } = await config.client.storage.getBucket(config.bucket);
    if (error || !data || data.public !== false) throw new WodImageStorageError();
    config.checkedAt = Date.now();
  }
  const imageStorageKey = `${userId}/${wodId}/${randomUUID()}`;
  const { error } = await config.client.storage
    .from(config.bucket)
    .upload(imageStorageKey, bytes, { contentType: mimeType, upsert: false, cacheControl: '0' });
  if (error) throw new WodImageStorageError();
  return { imageData: null, imageMimeType: mimeType, imageStorageKey, imageSha256: digest(bytes) };
}
async function read(source: ImageSource): Promise<Buffer | null> {
  if (!source.imageMimeType || !WOD_IMAGE_ALLOWED_MIME_TYPES.includes(source.imageMimeType))
    return null;
  if (!source.imageStorageKey)
    return source.imageData ? Buffer.from(source.imageData, 'base64') : null;
  if (
    !source.imageStorageKey.startsWith(`${source.userId}/${source.id}/`) ||
    source.imageStorageKey.split('/').length !== 3 ||
    !/^[a-f0-9]{64}$/.test(source.imageSha256 ?? '')
  )
    throw new WodImageStorageError();
  const config = storage();
  const { data, error } = await config.client.storage
    .from(config.bucket)
    .download(source.imageStorageKey);
  if (error || !data || data.size > WOD_IMAGE_MAX_BYTES) throw new WodImageStorageError();
  const bytes = Buffer.from(await data.arrayBuffer());
  if (digest(bytes) !== source.imageSha256) throw new WodImageStorageError();
  return bytes;
}
async function remove(source: Pick<ImageSource, 'id' | 'userId' | 'imageStorageKey'>) {
  if (!source.imageStorageKey) return;
  if (
    !source.imageStorageKey.startsWith(`${source.userId}/${source.id}/`) ||
    source.imageStorageKey.split('/').length !== 3
  )
    throw new WodImageStorageError();
  const config = storage();
  const { error } = await config.client.storage
    .from(config.bucket)
    .remove([source.imageStorageKey]);
  if (error) throw new WodImageStorageError();
}
async function opaqueStorage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new WodImageStorageError();
  }
}
export const storeWodImage = (...args: Parameters<typeof store>) =>
  opaqueStorage(() => store(...args));
export const readWodImage = (...args: Parameters<typeof read>) =>
  opaqueStorage(() => read(...args));
export const deleteWodImage = (...args: Parameters<typeof remove>) =>
  opaqueStorage(() => remove(...args));

export function wodSourceResponse<T extends object>(
  source: T,
  compact: true,
): Omit<T, 'imageStorageKey' | 'imageSha256' | 'imageData'>;
export function wodSourceResponse<T extends object>(
  source: T,
  compact?: false,
): Omit<T, 'imageStorageKey' | 'imageSha256'>;
export function wodSourceResponse<T extends object>(source: T, compact = false) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        key !== 'imageStorageKey' && key !== 'imageSha256' && (!compact || key !== 'imageData'),
    ),
  );
}
