import { useEffect, useState, type ReactNode } from 'react';

export function AppIntro({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'enter' | 'exit' | 'done'>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'done' : 'enter',
  );

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = () => {
      if (preference.matches) setPhase('done');
    };
    preference.addEventListener('change', onPreferenceChange);
    const reveal = window.setTimeout(
      () => setPhase((current) => (current === 'done' ? current : 'exit')),
      1350,
    );
    const finish = window.setTimeout(() => setPhase('done'), 1800);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(finish);
      preference.removeEventListener('change', onPreferenceChange);
    };
  }, []);

  return (
    <>
      <div hidden={phase === 'enter'}>{children}</div>
      {phase !== 'done' && (
        <div
          role="status"
          aria-label="Abrindo WOD Coach AI"
          className={`app-intro bg-neutral-950 text-neutral-100 ${phase === 'exit' ? 'app-intro-exit' : ''}`}
        >
          <span className="app-intro-letter app-intro-letter-top" aria-hidden="true">
            W
          </span>
          <span className="app-intro-letter app-intro-letter-bottom" aria-hidden="true">
            C
          </span>
          <div className="app-intro-brand">
            <img src="/icon-192.png" width={88} height={88} alt="" className="app-intro-logo" />
            <p className="app-intro-name">
              <span className="text-orange-500">WOD</span> Coach AI
            </p>
          </div>
        </div>
      )}
    </>
  );
}
