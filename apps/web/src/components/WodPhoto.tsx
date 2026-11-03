import { useState } from 'react';
import { api, type Wod } from '../lib/api.js';

export function WodPhoto({ wod }: { wod: Wod }) {
  const [opened, setOpened] = useState(false);
  if (!wod.imageMimeType) return null;
  const src = wod.imageData
    ? `data:${wod.imageMimeType};base64,${wod.imageData}`
    : api.wodImageUrl(wod.id);
  const photo = (
    <img
      src={src}
      alt="Foto do treino"
      decoding="async"
      className="w-full rounded-lg border border-neutral-800"
    />
  );
  // When the photo is the only prescription it remains visible automatically.
  if (!wod.rawText?.trim()) return photo;
  return (
    <details
      className="rounded-lg border border-neutral-800 px-3 py-2"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer text-sm text-neutral-400">Ver foto do treino</summary>
      {opened && <div className="mt-3">{photo}</div>}
    </details>
  );
}
