import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import wodRoutes from '../../apps/api/src/routes/wod.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { WOD_IMAGE_MAX_BYTES } from '@wod-coach-ai/validation';

const create = vi.hoisted(() => vi.fn());
vi.mock('../../packages/database/dist/index.js', () => ({ prisma: { wod: { create } } }));
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const sharp = requireApi('sharp');

describe('WOD screenshot upload', () => {
  it('persists matching optimized MIME/bytes through the multipart route with the source intact', async () => {
    const app = requireApi('fastify')() as FastifyInstance;
    app.decorate('authenticate', async (request: FastifyRequest) => {
      request.user = { sub: 'athlete' };
    });
    app.register(requireApi('@fastify/multipart'), {
      limits: { fileSize: WOD_IMAGE_MAX_BYTES, files: 1 },
    });
    app.register(wodRoutes);
    create.mockResolvedValue({ id: 'new', sourceType: 'IMAGE' });
    const fixture = await readFile(new URL('../fixtures/wod-ladder.png', import.meta.url));
    const original = await sharp(fixture).png({ compressionLevel: 0 }).toBuffer();
    const boundary = 'wod-image-test';
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/wods',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="wod.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          original,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });
      expect(response.statusCode).toBe(201);
      const stored = create.mock.calls[0][0].data;
      expect(stored).toMatchObject({
        userId: 'athlete',
        sourceType: 'IMAGE',
        imageMimeType: 'image/webp',
      });
      const optimized = Buffer.from(stored.imageData, 'base64');
      expect(optimized.length).toBeLessThan(original.length);
      const before = await sharp(fixture).ensureAlpha().raw().toBuffer();
      const after = await sharp(optimized).ensureAlpha().raw().toBuffer();
      expect(after.equals(before)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
