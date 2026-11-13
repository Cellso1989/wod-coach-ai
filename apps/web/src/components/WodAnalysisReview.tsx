import { useEffect, useRef, useState } from 'react';
import { wodWarningAction } from '@wod-coach-ai/types';
import { api, ApiError, type WodAnalysis } from '../lib/api.js';
import { formatWodAnalysisWarnings, wodAnalysisWarningKey } from '../lib/wod-analysis-warnings.js';
import { Alert, Button } from './ui.js';

export function WodAnalysisReview({
  wodId,
  analysis,
  disabled,
  canEditLoads,
  onCorrect,
  onDuration,
  onLoads,
  onSaved,
  onSavingChange,
}: {
  wodId: string;
  analysis: WodAnalysis;
  disabled: boolean;
  canEditLoads: boolean;
  onCorrect: () => void;
  onDuration: () => void;
  onLoads: () => void;
  onSaved: (analysis: WodAnalysis) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const pending = analysis.warnings.some(
    (warning) => wodWarningAction(warning) === 'interpretation',
  );
  const confirmed = analysis.rawResponse?.confirmedWarnings ?? [];
  const warnings = formatWodAnalysisWarnings(analysis.warnings);

  async function confirm(confirmedWarnings: string[]) {
    if (disabled || saving) return;
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      const { analysis: updated } = await api.updateWodAnalysis(wodId, {
        versionId: analysis.versionId ?? undefined,
        confirmedWarnings,
      });
      if (active.current) onSaved(updated);
    } catch (err) {
      if (active.current)
        setError(
          err instanceof ApiError ? err.message : 'Nao foi possivel confirmar a interpretacao.',
        );
    } finally {
      if (active.current) setSaving(false);
      onSavingChange(false);
    }
  }

  if (!warnings.length && !confirmed.length) return null;
  return (
    <section
      aria-label="Revisar interpretação"
      className="space-y-3 rounded-lg border border-amber-900/50 p-3"
    >
      <h2 className="text-sm font-semibold text-neutral-200">Revisar interpretação</h2>
      <p className="text-xs text-neutral-400">
        {pending
          ? 'Confirme ou corrija as interpretações antes de gerar a estratégia. Tempo e cargas podem ficar sem informação.'
          : 'Confira os dados do treino. Tempo e cargas podem ficar sem informação.'}
      </p>
      {error && <Alert>{error}</Alert>}
      {warnings.length > 0 && (
        <ul aria-label="Avisos da análise" className="space-y-3 text-sm text-amber-400">
          {warnings.map((warning) => {
            // Presentation may split or deduplicate warnings. Persist the exact originals.
            const originals = analysis.warnings.filter((raw) =>
              formatWodAnalysisWarnings([raw]).some(
                (formatted) => wodAnalysisWarningKey(formatted) === wodAnalysisWarningKey(warning),
              ),
            );
            const interpretations = originals.filter(
              (raw) => wodWarningAction(raw) === 'interpretation',
            );
            const action = wodWarningAction(originals[0] ?? warning);
            return (
              <li key={warning} className="space-y-2 break-words">
                <p>{warning}</p>
                {interpretations.length > 0 && /Ha uma observacao/.test(warning) && (
                  <p className="text-xs text-neutral-400">{interpretations.join(' ')}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {interpretations.length > 0 ? (
                    <>
                      <Button
                        disabled={disabled || saving || !analysis.versionId}
                        onClick={() => void confirm(interpretations)}
                      >
                        {saving ? 'Salvando...' : 'Confirmar interpretação'}
                      </Button>
                      <Button disabled={disabled || saving} variant="secondary" onClick={onCorrect}>
                        Corrigir no texto
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={disabled || saving}
                      variant="secondary"
                      onClick={
                        action === 'duration'
                          ? onDuration
                          : action === 'loads' && canEditLoads
                            ? onLoads
                            : onCorrect
                      }
                    >
                      {action === 'duration'
                        ? 'Informar tempo'
                        : action === 'loads' && canEditLoads
                          ? 'Revisar cargas'
                          : 'Conferir no texto'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pending && !analysis.versionId && (
        <p className="text-xs text-amber-400">
          Reanalise este treino para confirmar a interpretação.
        </p>
      )}
      {confirmed.length > 0 && (
        <details className="text-xs text-green-400">
          <summary className="cursor-pointer">
            Interpretações confirmadas ({confirmed.length})
          </summary>
          <ul className="mt-2 space-y-2 text-neutral-400">
            {formatWodAnalysisWarnings(confirmed).map((warning) => (
              <li key={warning}>{warning.replace(/\s*Confirme\b[^]*$/i, '').trim()}</li>
            ))}
          </ul>
          <Button
            className="mt-2"
            variant="secondary"
            disabled={disabled || saving}
            onClick={onCorrect}
          >
            Corrigir no texto
          </Button>
        </details>
      )}
    </section>
  );
}
