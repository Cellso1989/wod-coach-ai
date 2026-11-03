import sharp from 'sharp';

/** Compress screenshots without resizing, cropping or introducing lossy text artifacts.
 * Unsupported, animated, oversized or already compact inputs keep their original bytes.
 */
export async function optimizeWodImage(buffer: Buffer, mimeType: string) {
  const started = performance.now();
  const original = { buffer, mimeType, optimized: false };
  let result = original;
  if (mimeType === 'image/png' && buffer.length >= 128 * 1024) {
    try {
      const image = sharp(buffer, { limitInputPixels: 8_000_000, animated: true });
      const metadata = await image.metadata();
      if (metadata.format === 'png' && (metadata.pages ?? 1) === 1 && metadata.depth === 'uchar') {
        const candidate = await image
          .rotate()
          .webp({ lossless: true, effort: 1 })
          .timeout({ seconds: 1 })
          .toBuffer();
        // A meaningful reduction must repay the extra decode/encode work.
        if (candidate.length <= buffer.length * 0.9) {
          result = { buffer: candidate, mimeType: 'image/webp', optimized: true };
        }
      }
    } catch {
      // Optimization is optional. Preserve the existing upload/OCR behavior on failure.
    }
  }
  return {
    ...result,
    originalBytes: buffer.length,
    storedBytes: result.buffer.length,
    durationMs: performance.now() - started,
  };
}
