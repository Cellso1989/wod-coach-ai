import { useEffect, useState } from 'react';
import { api, ApiError, type WodStrategy } from '../lib/api.js';
import { Alert, Button, Card } from './ui.js';
import { WhatsAppShareButton } from './WhatsAppShareButton.js';
import { formatWodStrategy } from '../lib/strategy-share.js';

interface StrategySectionProps {
  wodId: string;
  workoutName?: string | null;
  initialStrategy: WodStrategy | null;
  onStrategyGenerated?: (strategy: WodStrategy) => void;
}

function StrategyNoteList({
  title,
  notes,
}: {
  title: string;
  notes: Array<{ movement: string; strategy: string }>;
}) {
  if (notes.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="space-y-2">
        {notes.map((note) => (
          <div key={`${title}-${note.movement}`} className="rounded-lg bg-neutral-950 p-3">
            <p className="text-sm font-semibold text-neutral-200">{note.movement}</p>
            <p className="mt-1 text-sm text-neutral-400">{note.strategy}</p>
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
  onStrategyGenerated,
}: StrategySectionProps) {
  const [strategy, setStrategy] = useState<WodStrategy | null>(initialStrategy);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStrategy(initialStrategy);
  }, [initialStrategy]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { strategy } = await api.generateStrategy(wodId);
      setStrategy(strategy);
      onStrategyGenerated?.(strategy);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel gerar a estrategia.');
    } finally {
      setGenerating(false);
    }
  }

  if (!strategy) {
    return (
      <div className="space-y-2">
        {error && <Alert>{error}</Alert>}
        {generating && (
          <Alert variant="info">
            Cruzando o WOD com seus PRs e historico. Isso pode levar alguns segundos.
          </Alert>
        )}
        <Button
          onClick={() => void handleGenerate()}
          disabled={generating}
          fullWidth
          className="py-4 font-bold"
        >
          {generating ? 'Montando estrategia...' : 'Gerar estrategia para hoje'}
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Estrategia de execucao">
      <Card className="space-y-5 break-words border-orange-900/50">
        <div className="rounded-lg bg-neutral-950 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Meta</p>
          <p className="mt-1 text-lg font-semibold">{strategy.target ?? strategy.goal}</p>
          {strategy.target && <p className="mt-1 text-sm text-neutral-400">{strategy.goal}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-neutral-950 p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Intensidade</p>
            <p className="mt-1 text-3xl font-bold text-orange-500">
              {strategy.recommendedIntensity}/10
            </p>
            <p className="text-xs text-neutral-500">RPE {strategy.targetRpe}</p>
          </div>
          <div className="rounded-lg bg-neutral-950 p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Ponto critico</p>
            <p className="mt-2 text-sm font-semibold text-yellow-400">
              {strategy.criticalPoint ?? 'Ritmo'}
            </p>
          </div>
        </div>

        {strategy.loadRecommendation && <Alert variant="info">{strategy.loadRecommendation}</Alert>}

        {strategy.warnings.length > 0 && (
          <section aria-label="Pontos de atencao" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-yellow-400">
              Pontos de atencao
            </h3>
            <ul className="space-y-2 border-l-2 border-yellow-500 pl-3 text-sm text-yellow-400">
              {strategy.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        <dl className="space-y-4">
          {[
            ['Ritmo', strategy.pacing],
            ['Descanso', strategy.restStrategy],
            ['Transicoes', strategy.transitionStrategy],
            ['Energia', strategy.energyManagement],
          ].map(
            ([label, text]) =>
              text && (
                <div key={label} className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label}
                  </dt>
                  <dd className="text-sm text-neutral-300">{text}</dd>
                </div>
              ),
          )}
        </dl>

        <StrategyNoteList title="Quebras" notes={strategy.breakStrategy} />
        <StrategyNoteList title="Execucao por movimento" notes={strategy.movementStrategy} />

        <WhatsAppShareButton message={formatWodStrategy(strategy, workoutName)} />

        <p className="text-center text-xs text-neutral-600">
          Confianca da recomendacao: {Math.round(strategy.confidence * 100)}%
        </p>
      </Card>
    </section>
  );
}
