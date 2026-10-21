import { useEffect, useState } from 'react';
import { api, ApiError, type WodAnalysis, type WodStrategy } from '../lib/api.js';
import { Alert, Button, Card } from './ui.js';
import { WhatsAppShareButton } from './WhatsAppShareButton.js';
import { formatWodStrategy } from '../lib/strategy-share.js';
import { WodGenerationProgress } from './WodGenerationProgress.js';
import { formatStrategyRoundLabels } from '../lib/strategy-round-labels.js';
import {
  readableStrategyText,
  isAnalysisReviewWarning,
  prescribedLoadForNote,
  compactStrategyTarget,
} from '../lib/strategy-presentation.js';

interface StrategySectionProps {
  wodId: string;
  workoutName?: string | null;
  initialStrategy: WodStrategy | null;
  analysis?: WodAnalysis | null;
  onStrategyGenerated?: (strategy: WodStrategy) => void;
  onGeneratingChange?: (generating: boolean) => void;
  disabled?: boolean;
}

function StrategyNoteList({
  title,
  notes,
  analysis,
}: {
  title: string;
  notes: Array<{ movement: string; strategy: string }>;
  analysis?: WodAnalysis | null;
}) {
  if (notes.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="space-y-2">
        {notes.map((note) => (
          <div key={`${title}-${note.movement}`} className="rounded-lg bg-neutral-950 p-3">
            <p className="text-sm font-semibold text-neutral-200">
              {formatStrategyRoundLabels(note.movement)}
              {prescribedLoadForNote(note.movement, analysis) && (
                <span className="ml-2 text-xs font-normal text-orange-400">
                  {prescribedLoadForNote(note.movement, analysis)}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {formatStrategyRoundLabels(note.strategy)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StrategySection({
  wodId,
  workoutName,
  initialStrategy,
  analysis,
  onStrategyGenerated,
  onGeneratingChange,
  disabled = false,
}: StrategySectionProps) {
  const [strategy, setStrategy] = useState<WodStrategy | null>(initialStrategy);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStrategy(initialStrategy);
  }, [initialStrategy]);

  async function handleGenerate() {
    if (disabled || generating) return;
    setGenerating(true);
    onGeneratingChange?.(true);
    setError(null);
    try {
      const { strategy } = await api.generateStrategy(wodId);
      setStrategy(strategy);
      onStrategyGenerated?.(strategy);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel gerar a estrategia.');
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  }

  if (!strategy) {
    return (
      <div className="space-y-2">
        {error && <Alert>{error}</Alert>}
        {generating && <WodGenerationProgress />}
        <Button
          onClick={() => void handleGenerate()}
          disabled={disabled || generating}
          fullWidth
          className="py-4 font-bold"
        >
          {generating ? 'Gerando...' : 'Gerar estrategia para hoje'}
        </Button>
      </div>
    );
  }

  const reviewWarnings = strategy.warnings.filter(isAnalysisReviewWarning);
  const executionWarnings = strategy.warnings.filter(
    (warning) => !isAnalysisReviewWarning(warning),
  );
  const timeCap =
    analysis?.durationMinutes != null &&
    ['FOR_TIME', 'ROUNDS_FOR_TIME', 'CHIPPER'].includes(analysis.format ?? '')
      ? analysis.durationMinutes
      : null;

  return (
    <section aria-label="Estrategia de execucao">
      <Card className="space-y-4 break-words border-orange-900/50">
        <div className="rounded-lg bg-neutral-950 p-4">
          <p className="text-xs uppercase tracking-wide text-orange-400">Meta</p>
          <p className="mt-1 text-lg font-semibold">
            {strategy.target
              ? compactStrategyTarget(strategy.target, timeCap != null)
              : strategy.goal}
          </p>
          {timeCap != null && <p className="mt-1 text-xs text-neutral-400">Cap: {timeCap} min</p>}
        </div>

        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ritmo</h3>
          <p className="text-sm text-neutral-200">{formatStrategyRoundLabels(strategy.pacing)}</p>
        </div>

        {strategy.loadRecommendation && <Alert variant="info">{strategy.loadRecommendation}</Alert>}
        <StrategyNoteList title="Quebras" notes={strategy.breakStrategy} analysis={analysis} />

        <p className="text-sm text-neutral-300">
          <span className="font-semibold text-neutral-200">Descanso: </span>
          {formatStrategyRoundLabels(strategy.restStrategy)}
        </p>

        {executionWarnings.length > 0 && (
          <section
            aria-label="Pontos de atencao"
            className="rounded-lg border border-yellow-600/30 bg-yellow-500/5 p-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-yellow-400">
              Atenção
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-yellow-300">
              {executionWarnings.map((warning, index) => (
                <li key={index}>{readableStrategyText(warning)}</li>
              ))}
            </ul>
          </section>
        )}

        {reviewWarnings.length > 0 && (
          <details className="rounded-lg border border-neutral-800 px-3 py-2">
            <summary className="cursor-pointer text-sm text-amber-400 focus-visible:outline-orange-500">
              Revisar análise ({reviewWarnings.length})
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
              {reviewWarnings.map((warning, index) => (
                <li key={index}>{readableStrategyText(warning)}</li>
              ))}
            </ul>
          </details>
        )}

        <details className="group border-t border-neutral-800 pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-orange-400 focus-visible:outline-orange-500">
            Ver estratégia completa
          </summary>
          <div className="mt-4 space-y-4">
            {strategy.target && <p className="text-sm text-neutral-300">{strategy.goal}</p>}
            <dl className="space-y-3">
              {[
                ['Transições', strategy.transitionStrategy],
                ['Energia', strategy.energyManagement],
                ['Ponto crítico', strategy.criticalPoint],
              ].map(
                ([label, text]) =>
                  text && (
                    <div key={label}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm text-neutral-300">
                        {formatStrategyRoundLabels(text)}
                      </dd>
                    </div>
                  ),
              )}
            </dl>
            <StrategyNoteList title="Execução por movimento" notes={strategy.movementStrategy} />
            <div className="rounded-lg bg-neutral-950 p-3 text-sm text-neutral-400">
              <p className="font-semibold text-neutral-200">
                Esforço alvo: {strategy.recommendedIntensity}/10 · RPE {strategy.targetRpe}
              </p>
              <p className="mt-1">
                Siga o ritmo e as pausas indicados para distribuir o esforço. Preserve a técnica e
                respeite os sinais de dor.
              </p>
            </div>
            <p className="text-xs text-neutral-500">
              Confiança da recomendação: {Math.round(strategy.confidence * 100)}%
            </p>
          </div>
        </details>
        <WhatsAppShareButton message={formatWodStrategy(strategy, workoutName)} />
      </Card>
    </section>
  );
}
