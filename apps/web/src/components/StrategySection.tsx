import { useEffect, useState } from 'react';
import { api, ApiError, type WodStrategy } from '../lib/api.js';
import { Alert, Button, Card } from './ui.js';

export function StrategySection({
  wodId,
  initialStrategy,
}: {
  wodId: string;
  initialStrategy: WodStrategy | null;
}) {
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar a estratégia.');
    } finally {
      setGenerating(false);
    }
  }

  if (!strategy) {
    return (
      <div className="space-y-2">
        {error && <Alert>{error}</Alert>}
        <Button
          onClick={() => void handleGenerate()}
          disabled={generating}
          fullWidth
          className="py-4 font-bold"
        >
          {generating ? 'Montando sua estratégia...' : '🧠 Gerar estratégia para hoje'}
        </Button>
      </div>
    );
  }

  return (
    <Card className="space-y-5 border-orange-900/50">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Intensidade</p>
        <p className="text-4xl font-bold text-orange-500">{strategy.recommendedIntensity}/10</p>
        <p className="text-sm text-neutral-400">RPE alvo: {strategy.targetRpe}</p>
        {strategy.loadRecommendation && (
          <p className="text-sm text-neutral-400">{strategy.loadRecommendation}</p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Estratégia
        </h3>

        {strategy.breakStrategy.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-300">Quebras por movimento</p>
            {strategy.breakStrategy.map((note) => (
              <p key={note.movement} className="text-sm text-neutral-400">
                <span className="font-medium text-neutral-300">{note.movement}:</span>{' '}
                {note.strategy}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-300">Descanso</p>
          <p className="text-sm text-neutral-400">{strategy.restStrategy}</p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-300">Transições</p>
          <p className="text-sm text-neutral-400">{strategy.transitionStrategy}</p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-300">Gestão de energia</p>
          <p className="text-sm text-neutral-400">{strategy.energyManagement}</p>
        </div>
      </div>

      <div className="rounded-lg bg-neutral-800 p-3 text-center">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Meta</p>
        <p className="text-lg font-semibold">{strategy.target ?? strategy.goal}</p>
        {strategy.target && <p className="text-sm text-neutral-400">{strategy.goal}</p>}
      </div>

      {strategy.criticalPoint && (
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Ponto crítico</p>
          <p className="font-semibold text-yellow-400">{strategy.criticalPoint}</p>
        </div>
      )}

      <p className="text-center text-xs text-neutral-600">
        Confiança da recomendação: {Math.round(strategy.confidence * 100)}%
      </p>
    </Card>
  );
}
