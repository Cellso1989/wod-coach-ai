import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { WodPhoto } from '../../apps/web/src/components/WodPhoto.js';
import type { Wod } from '../../apps/web/src/lib/api.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { createElement } = requireWeb('react');
const { renderToStaticMarkup } = requireWeb('react-dom/server');
const render = (fields: Partial<Wod>) =>
  renderToStaticMarkup(
    createElement(WodPhoto, {
      wod: { id: 'wod', rawText: '21-15-9', imageMimeType: 'image/png', ...fields },
    }),
  );

describe('deferred workout photo', () => {
  it('does not put an image request in the initial DOM when the prescription is already in text', () => {
    const html = render({});
    expect(html).toContain('Ver foto do treino');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/image');
  });
  it('displays the photo automatically when it is the only prescription', () => {
    const html = render({ rawText: null });
    expect(html).toContain('<img');
    expect(html).toContain('/api/wods/wod/image');
    expect(html).not.toContain('<details');
  });
  it('preserves legacy inline photos and omits the photo control for text-only workouts', () => {
    expect(render({ rawText: null, imageData: 'YWJj' })).toContain('data:image/png;base64,YWJj');
    expect(render({ imageMimeType: null })).toBe('');
  });
});
