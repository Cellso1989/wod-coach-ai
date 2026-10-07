import { useLayoutEffect, useRef } from 'react';
import { STRATEGY_PREPARATION_MESSAGE } from '../lib/wod-messages.js';

export function WodGenerationProgress({
  message = STRATEGY_PREPARATION_MESSAGE,
}: {
  message?: string;
}) {
  const container = useRef<HTMLParagraphElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!container.current || !text.current) return;
    const line = container.current;
    const label = text.current;
    const fit = () => {
      label.style.fontSize = '16px';
      const width = label.getBoundingClientRect().width;
      if (width > 0) label.style.fontSize = `${Math.min(16, (16 * line.clientWidth) / width)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(line);
    return () => observer.disconnect();
  }, [message]);

  return (
    <div role="status" aria-atomic="true" className="bg-orange-950/30 px-2 py-3 text-orange-400">
      <p ref={container} className="min-w-0 leading-6">
        <span ref={text} className="inline-block whitespace-nowrap text-base font-semibold">
          {message}
        </span>
      </p>
    </div>
  );
}
