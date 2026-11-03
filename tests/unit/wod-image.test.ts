import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { optimizeWodImage } from '../../apps/api/src/services/wod-image.js';

const sharp = createRequire(new URL('../../apps/api/package.json', import.meta.url))('sharp');

describe('lossless WOD image optimization', () => {
  it('reduces a screenshot while preserving decoded pixels, dimensions and transparency', async () => {
    const width = 720,
      height = 1280;
    const pixels = Buffer.alloc(width * height * 4, 255);
    // Fine contrasting strokes and transparent pixels exercise OCR-relevant details.
    for (let y = 40; y < 1200; y += 12) {
      for (let x = 20; x < 650; x++) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
      }
    }
    pixels[3] = 0;
    const original = await sharp(pixels, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const result = await optimizeWodImage(original, 'image/png');
    expect(result.optimized).toBe(true);
    expect(result.mimeType).toBe('image/webp');
    expect(result.storedBytes).toBeLessThan(original.length * 0.9);
    const before = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(result.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(after.info.width).toBe(before.info.width);
    expect(after.info.height).toBe(before.info.height);
    // RGB at fully transparent pixels is not visible; compare visible RGB plus all alpha values.
    for (let i = 0; i < before.data.length; i += 4) {
      if (before.data[i + 3] === 0 && after.data[i + 3] === 0) {
        before.data.fill(0, i, i + 3);
        after.data.fill(0, i, i + 3);
      }
    }
    expect(after.data.equals(before.data)).toBe(true);
  });

  it.each(['image/jpeg', 'image/heic', 'image/webp'])(
    'preserves original %s bytes',
    async (mime) => {
      const original = Buffer.alloc(150 * 1024, 1);
      const result = await optimizeWodImage(original, mime);
      expect(result.buffer).toBe(original);
      expect(result.mimeType).toBe(mime);
      expect(result.optimized).toBe(false);
    },
  );

  it('preserves small PNGs and gracefully falls back on invalid input', async () => {
    for (const original of [Buffer.from('small'), Buffer.alloc(150 * 1024, 1)]) {
      const result = await optimizeWodImage(original, 'image/png');
      expect(result.buffer).toBe(original);
      expect(result.optimized).toBe(false);
    }
  });
});
