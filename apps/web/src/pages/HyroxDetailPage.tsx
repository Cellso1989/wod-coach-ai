import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  ApiError,
  type HyroxStrategy,
  type HyroxWorkout,
  type WodAnalysis,
} from '../lib/api.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { NavBar } from '../components/NavBar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Button, Card, PageShell, TextArea } from '../components/ui.js';

function HyroxFlowCard({
  hasText,
  hasAnalysis,
  hasStrategy,
}: {
  hasText: boolean;
  hasAnalysis: boolean;
  hasStrategy: boolean;
}) {
  const steps = [
    { label: 'Treino recebido', done: hasText },
    { label: 'Analise', done: hasAnalysis },
    { label: 'Estrategia', done: hasStrategy },
  ];

  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold text-neutral-300">Fluxo HYROX</p>
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`rounded-lg border px-2 py-2 text-center text-xs ${
              step.done
                ? 'border-green-900/50 bg-green-950/20 text-green-300'
                : 'border-neutral-800 bg-neutral-950 text-neutral-500'
            }`}
          >
            {step.done ? '✓ ' : ''}
            {step.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

function HyroxStrategyCard({ strategy }: { strategy: HyroxStrategy }) {
  return (
    <Card className="space-y-4 border-orange-900/50">
      <div className="rounded-lg bg-neutral-950 p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Resumo</p>
        <p className="mt-1 text-lg font-semibold">{strategy.workoutSummary}</p>
        {strategy.target && <p className="mt-1 text-sm text-orange-300">{strategy.target}</p>}
      </div>

      {strategy.runPace && <Alert variant="info">{strategy.runPace}</Alert>}

      <div className="space-y-2 text-sm text-neutral-400">
        <p>
          <span className="font-semibold text-neutral-200">Pacing:</span> {strategy.pacing}
        </p>
        <p>
          <span className="font-semibold text-neutral-200">Transicoes:</span>{' '}
          {strategy.transitionStrategy}
        </p>
        <p>
          <span className="font-semibold text-neutral-200">Risco:</span> {strategy.criticalRisk}
        </p>
        <p>
          <span className="font-semibold text-neutral-200">Final:</span> {strategy.finalPush}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Plano por blocos
        </h3>
        {strategy.blockPlan.map((block, index) => (
          <div key={`${block.block}-${index}`} className="rounded-lg bg-neutral-950 p-3">
            <p className="text-sm font-semibold text-neutral-200">
              {index + 1}. {block.block}
            </p>
            <p className="mt-1 text-xs text-orange-300">{block.focus}</p>
            <p className="mt-1 text-sm text-neutral-400">{block.execution}</p>
          </div>
        ))}
      </div>

      {strategy.breakStrategy.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Quebras
          </h3>
          {strategy.breakStrategy.map((item) => (
            <div key={item.movement} className="rounded-lg bg-neutral-950 p-3">
              <p className="text-sm font-semibold text-neutral-200">{item.movement}</p>
              <p className="mt-1 text-sm text-neutral-400">{item.strategy}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-neutral-600">
        Confianca da recomendacao: {Math.round(strategy.confidence * 100)}%
      </p>
    </Card>
  );
}

export function HyroxDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<HyroxWorkout | null>(null);
  const [analysis, setAnalysis] = useState<WodAnalysis | null>(null);
  const [strategy, setStrategy] = useState<HyroxStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');

  useEffect(() => {
    if (!id) return;
    api
      .getHyroxWorkout(id)
      .then(({ workout }) => setWorkout(workout))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));

    api
      .getHyroxAnalysis(id)
      .then(({ analysis }) => setAnalysis(analysis))
      .catch(() => undefined);
    api
      .getHyroxWorkoutStrategy(id)
      .then(({ strategy }) => setStrategy(strategy))
      .catch(() => undefined);
  }, [id]);

  function startEditing() {
    setEditedText(workout?.rawText ?? '');
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!id) return;
    setWorking(true);
    try {
      const { workout: updated } = await api.updateHyroxWorkout(id, {
        rawText: editedText.trim(),
      });
      setWorkout(updated);
      setAnalysis(null);
      setStrategy(null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel salvar.');
    } finally {
      setWorking(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Apagar este treino HYROX? Essa acao nao pode ser desfeita.')) return;
    setWorking(true);
    try {
      await api.deleteHyroxWorkout(id);
      navigate('/hyrox', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel apagar.');
    } finally {
      setWorking(false);
    }
  }

  async function handleAnalyze() {
    if (!id) return;
    setWorking(true);
    setStatus('Analisando treino HYROX...');
    setError(null);
    try {
      const { analysis, workout: updatedWorkout } = await api.analyzeHyroxWorkout(id);
      setAnalysis(analysis);
      setStrategy(null);
      if (updatedWorkout) setWorkout(updatedWorkout);
      setStatus('Gerando estrategia HYROX...');
      const { strategy } = await api.generateHyroxWorkoutStrategy(id);
      setStrategy(strategy);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel analisar o treino.');
    } finally {
      setWorking(false);
      setStatus(null);
    }
  }

  async function handleGenerateStrategy() {
    if (!id) return;
    setWorking(true);
    setStatus('Gerando estrategia HYROX...');
    setError(null);
    try {
      const { strategy } = await api.generateHyroxWorkoutStrategy(id);
      setStrategy(strategy);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel gerar estrategia.');
    } finally {
      setWorking(false);
      setStatus(null);
    }
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-xl font-bold">{workout?.name ?? 'HYROX'}</h1>
          <div className="flex shrink-0 items-center gap-3">
            <BrandHomeLink />
            <Link to="/hyrox" className="text-sm text-neutral-400">
              Voltar
            </Link>
          </div>
        </div>
      </PageHeader>

      <NavBar />

      {loading && <p className="text-neutral-400">Carregando...</p>}
      {error && <Alert>{error}</Alert>}
      {status && <Alert variant="info">{status}</Alert>}

      {workout && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            {new Date(workout.date).toLocaleDateString('pt-BR')}
          </p>

          {workout.imageData && workout.imageMimeType && (
            <img
              src={`data:${workout.imageMimeType};base64,${workout.imageData}`}
              alt="Foto do treino HYROX"
              className="w-full rounded-lg border border-neutral-800"
            />
          )}

          {!editing ? (
            <div className="space-y-2">
              {workout.rawText && (
                <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
                  {workout.rawText}
                </pre>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={startEditing} disabled={working} variant="secondary">
                  {workout.rawText ? 'Editar' : 'Adicionar texto'}
                </Button>
                <Button onClick={() => void handleDelete()} disabled={working} variant="danger">
                  Apagar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <TextArea
                value={editedText}
                onChange={(event) => setEditedText(event.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-neutral-600">
                Editar o texto apaga a analise e a estrategia HYROX geradas.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setEditing(false)}
                  disabled={working}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleSaveEdit()}
                  disabled={working || !editedText.trim()}
                  className="flex-1"
                >
                  Salvar
                </Button>
              </div>
            </div>
          )}

          <HyroxFlowCard
            hasText={Boolean(workout.rawText || workout.imageData)}
            hasAnalysis={Boolean(analysis)}
            hasStrategy={Boolean(strategy)}
          />

          {!analysis && (
            <Button onClick={() => void handleAnalyze()} disabled={working} fullWidth>
              {working ? 'Trabalhando...' : 'Analisar treino'}
            </Button>
          )}

          {analysis && (
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-300">Analise</p>
                <span className="text-xs text-neutral-500">
                  {Math.round(analysis.confidence * 100)}%
                </span>
              </div>
              {analysis.stimulus && <p className="text-sm text-neutral-400">{analysis.stimulus}</p>}
              <ul className="space-y-1">
                {analysis.movements.map((movement) => (
                  <li key={movement.id} className="text-sm text-neutral-300">
                    {movement.name}
                    {movement.reps != null ? ` · ${movement.reps} reps` : ''}
                    {movement.distanceMeters != null ? ` · ${movement.distanceMeters}m` : ''}
                    {movement.loadDescription ? ` · ${movement.loadDescription}` : ''}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => void handleAnalyze()}
                disabled={working}
                variant="secondary"
                fullWidth
              >
                Reanalisar treino
              </Button>
            </Card>
          )}

          {analysis && !strategy && (
            <Button onClick={() => void handleGenerateStrategy()} disabled={working} fullWidth>
              {working ? 'Gerando...' : 'Gerar estrategia HYROX'}
            </Button>
          )}

          {strategy && <HyroxStrategyCard strategy={strategy} />}
        </div>
      )}
    </PageShell>
  );
}
