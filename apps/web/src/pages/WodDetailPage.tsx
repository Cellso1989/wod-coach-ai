import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { isWodLoadMovement, wodWarningAction } from '@wod-coach-ai/types';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  ApiError,
  type Wod,
  type WodAnalysis,
  type WodResult,
  type WodStrategy,
} from '../lib/api.js';
import { WodResultSection } from '../components/WodResultSection.js';
import { AthleteContextSection } from '../components/AthleteContextSection.js';
import { StrategySection } from '../components/StrategySection.js';
import { WorkoutDetails } from '../components/WorkoutDetails.js';
import { WodGenerationProgress } from '../components/WodGenerationProgress.js';
import { WodLoadEditor } from '../components/WodLoadEditor.js';
import { WodPhoto } from '../components/WodPhoto.js';
import { WodAnalysisReview } from '../components/WodAnalysisReview.js';
import { WodVersionHistory } from '../components/WodVersionHistory.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { NavBar } from '../components/NavBar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Button, Card, PageShell, TextArea, TextInput } from '../components/ui.js';

const FORMAT_LABEL: Record<NonNullable<WodAnalysis['format']>, string> = {
  AMRAP: 'AMRAP',
  FOR_TIME: 'For Time',
  EMOM: 'EMOM',
  E2MOM: 'E2MOM',
  CHIPPER: 'Chipper',
  ROUNDS_FOR_TIME: 'Rounds For Time',
  STRENGTH: 'Strength',
  INTERVAL: 'Intervalos',
};

function WodFlowCard({
  hasText,
  hasAnalysis,
  needsReview,
  hasStrategy,
  hasResult,
}: {
  hasText: boolean;
  hasAnalysis: boolean;
  needsReview: boolean;
  hasStrategy: boolean;
  hasResult: boolean;
}) {
  const steps = [
    { label: 'WOD recebido', done: hasText },
    { label: 'Análise', done: hasAnalysis },
    ...(hasAnalysis && needsReview ? [{ label: 'Revisar interpretação', done: false }] : []),
    { label: 'Estratégia', done: hasStrategy },
    { label: 'Resultado', done: hasResult },
  ];

  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold text-neutral-300">Fluxo do treino</p>
      <div className="grid grid-cols-2 gap-2">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`rounded-lg border px-3 py-2 text-sm ${
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

export function WodDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <WodDetailContent key={id} id={id} />;
}

function WodDetailContent({ id }: { id: string | undefined }) {
  const navigate = useNavigate();
  const [wod, setWod] = useState<Wod | null>(null);
  const [analysis, setAnalysis] = useState<WodAnalysis | null>(null);
  const [strategy, setStrategy] = useState<WodStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingDuration, setEditingDuration] = useState(false);
  const [editedDuration, setEditedDuration] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);
  const [editingLoads, setEditingLoads] = useState(false);
  const [savingLoads, setSavingLoads] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [readErrors, setReadErrors] = useState<string[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [generatingStrategy, setGeneratingStrategy] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const sourceEditor = useRef<HTMLDivElement>(null);
  const durationEditor = useRef<HTMLDivElement>(null);
  const loadEditor = useRef<HTMLDivElement>(null);
  const needsReview = Boolean(
    analysis?.warnings.some((warning) => wodWarningAction(warning) === 'interpretation'),
  );
  const active = useRef(false);
  const busy =
    loading ||
    analyzing ||
    saving ||
    savingDuration ||
    savingLoads ||
    savingReview ||
    deleting ||
    generatingStrategy;
  const blocked = busy || readErrors.length > 0 || Boolean(error);

  useEffect(() => {
    const target = editing
      ? sourceEditor.current
      : editingDuration
        ? durationEditor.current
        : editingLoads
          ? loadEditor.current
          : null;
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true });
  }, [editing, editingDuration, editingLoads]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setReadErrors([]);
    setWod(null);
    // The fast detail endpoint resolves all projections together. The source can
    // already be read during an older server's compatibility requests.
    void api
      .getWodDetail(id, controller.signal, (source) => {
        if (!controller.signal.aborted) setWod(source);
      })
      .then((detail) => {
        if (controller.signal.aborted) return;
        setWod(detail.wod);
        setAnalysis(detail.analysis);
        setStrategy(detail.strategy);
        setReadErrors(detail.readErrors);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setWod(null);
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar WOD.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, loadAttempt]);

  function startEditing() {
    setEditedText(wod?.rawText ?? analysis?.rawResponse?.extractedText ?? '');
    setSaveError(null);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!id || blocked) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { wod: updated } = await api.updateWod(id, { rawText: editedText.trim() });
      if (!active.current) return;
      setWod(updated);
      if (updated.rawText !== wod?.rawText) {
        setAnalysis(null);
        setStrategy(null);
      }
      setEditing(false);
    } catch (err) {
      if (!active.current) return;
      setSaveError(err instanceof ApiError ? err.message : 'Não foi possível salvar a edição.');
    } finally {
      if (active.current) setSaving(false);
    }
  }

  function startEditingDuration() {
    setEditedDuration(analysis?.durationMinutes != null ? String(analysis.durationMinutes) : '');
    setDurationError(null);
    setEditingDuration(true);
  }

  async function handleSaveDuration() {
    if (!id || blocked) return;
    const trimmed = editedDuration.trim();
    const parsedValue = trimmed ? Number(trimmed) : null;
    if (trimmed && (!Number.isFinite(parsedValue) || parsedValue! < 0 || parsedValue! > 180)) {
      setDurationError('Informe um tempo entre 0 e 180 minutos.');
      return;
    }
    setSavingDuration(true);
    setDurationError(null);
    try {
      const { analysis: updated } = await api.updateWodAnalysis(id, {
        durationMinutes: parsedValue,
      });
      if (!active.current) return;
      setAnalysis(updated);
      setAnalysisRevision((value) => value + 1);
      setStrategy(null);
      setEditingDuration(false);
    } catch (err) {
      if (!active.current) return;
      setDurationError(err instanceof ApiError ? err.message : 'Não foi possível salvar o tempo.');
    } finally {
      if (active.current) setSavingDuration(false);
    }
  }

  async function handleDeleteWod() {
    if (!id || blocked) return;
    const confirmed = window.confirm(
      'Apagar este WOD? Essa acao nao pode ser desfeita e tambem remove analise, estrategia e resultado.',
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteWod(id);
      if (!active.current) return;
      navigate('/wods', { replace: true });
    } catch (err) {
      if (!active.current) return;
      setDeleteError(err instanceof ApiError ? err.message : 'Nao foi possivel apagar o WOD.');
    } finally {
      if (active.current) setDeleting(false);
    }
  }

  async function handleAnalyze() {
    if (!id || blocked) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus('Analisando o Wod para nosso Atleta');
    try {
      const { analysis, wod: updatedWod } = await api.analyzeWod(id);
      if (!active.current) return;
      setAnalysis(analysis);
      setAnalysisRevision((value) => value + 1);
      setStrategy(null);
      if (updatedWod) setWod(updatedWod);
    } catch (err) {
      if (!active.current) return;
      setAnalysisError(
        err instanceof ApiError ? err.message : 'Não foi possível analisar este WOD.',
      );
    } finally {
      if (active.current) {
        setAnalyzing(false);
        setAnalysisStatus(null);
      }
    }
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-xl font-bold">{wod?.name ?? 'WOD'}</h1>
          <div className="flex shrink-0 items-center gap-3">
            <BrandHomeLink />
            <Link to="/wods" className="text-sm text-neutral-400">
              Voltar
            </Link>
          </div>
        </div>
      </PageHeader>

      <NavBar />

      {loading && (
        <p role="status" className="text-neutral-400">
          Carregando...
        </p>
      )}
      {loading && wod?.rawText && (
        <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
          {wod.rawText}
        </pre>
      )}
      {(error || readErrors.length > 0) && (
        <div className="space-y-2">
          <div role="alert" className="space-y-2">
            {error && <Alert>{error}</Alert>}
            {readErrors.map((message) => (
              <Alert key={message}>{message}</Alert>
            ))}
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={busy}
            onClick={() => setLoadAttempt((value) => value + 1)}
          >
            <RefreshCw size={18} aria-hidden="true" />
            Tentar carregar novamente
          </Button>
        </div>
      )}

      {!loading && !error && wod && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            {new Date(wod.date).toLocaleDateString('pt-BR')}
          </p>
          <WodVersionHistory
            key={wod.id}
            wodId={wod.id}
            analysisVersionId={analysis?.versionId}
            strategyVersionId={strategy?.versionId}
          />

          <WodPhoto wod={wod} />

          {!editing && (
            <div className="space-y-2">
              {wod.rawText && (
                <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
                  {wod.rawText}
                </pre>
              )}
              {deleteError && <Alert>{deleteError}</Alert>}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={startEditing}
                  disabled={blocked || editingDuration || editingLoads}
                  variant="secondary"
                >
                  {wod.rawText ? 'Editar' : 'Adicionar texto'}
                </Button>
                <Button
                  onClick={() => void handleDeleteWod()}
                  disabled={blocked || editingLoads}
                  variant="danger"
                >
                  {deleting ? 'Apagando...' : 'Apagar'}
                </Button>
              </div>
            </div>
          )}

          {editing && (
            <div ref={sourceEditor} className="space-y-2">
              {saveError && <Alert>{saveError}</Alert>}
              <TextArea
                aria-label="Texto do treino"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-neutral-600">
                Corrija as siglas, cargas ou a sequência no texto, salve e analise novamente. Editar
                o texto apaga a análise e a estratégia já geradas para este WOD.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleSaveEdit()}
                  disabled={blocked || !editedText.trim()}
                  className="flex-1"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}

          {wod.notes && <p className="text-sm text-neutral-400">Notas: {wod.notes}</p>}

          <WodFlowCard
            hasText={Boolean(wod.rawText || wod.imageData)}
            hasAnalysis={Boolean(analysis)}
            needsReview={needsReview}
            hasStrategy={Boolean(strategy)}
            hasResult={Boolean(wod.result)}
          />

          {!analysis && (
            <div className="space-y-2">
              {analysisError && <Alert>{analysisError}</Alert>}
              {analysisStatus && <WodGenerationProgress message={analysisStatus} />}
              <Button
                onClick={() => void handleAnalyze()}
                disabled={blocked || editing || editingDuration || editingLoads}
                fullWidth
              >
                {analyzing ? 'Trabalhando no treino...' : 'Analisar treino'}
              </Button>
            </div>
          )}

          {analysis && (
            <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-orange-600/20 px-3 py-1 text-sm font-semibold text-orange-400">
                  {analysis.format ? FORMAT_LABEL[analysis.format] : 'Formato não identificado'}
                </span>
                {!editingDuration && (
                  <button
                    disabled={blocked || editing || editingLoads}
                    onClick={startEditingDuration}
                    className="text-sm text-neutral-400 underline decoration-dotted"
                  >
                    {analysis.durationMinutes != null
                      ? `${['FOR_TIME', 'ROUNDS_FOR_TIME', 'CHIPPER'].includes(analysis.format ?? '') ? 'Time cap: ' : 'Tempo: '}${analysis.durationMinutes} min ✏️`
                      : 'Definir tempo ✏️'}
                  </button>
                )}
              </div>

              {analysis.rawResponse?.targetMinutes != null && (
                <p className="text-sm font-semibold text-orange-400">
                  Target (meta): {analysis.rawResponse.targetMinutes} min
                </p>
              )}
              <WodAnalysisReview
                key={`review-${analysis.versionId ?? analysisRevision}`}
                wodId={wod.id}
                analysis={analysis}
                disabled={blocked || editing || editingDuration || editingLoads}
                canEditLoads={analysis.movements.some(isWodLoadMovement)}
                onCorrect={startEditing}
                onDuration={startEditingDuration}
                onLoads={() => setEditingLoads(true)}
                onSavingChange={(value) => {
                  if (active.current) setSavingReview(value);
                }}
                onSaved={(updated) => {
                  if (!active.current) return;
                  setAnalysis(updated);
                  setAnalysisRevision((value) => value + 1);
                  setStrategy(null);
                }}
              />

              {editingDuration && (
                <div ref={durationEditor} className="space-y-2">
                  {durationError && <Alert>{durationError}</Alert>}
                  <div className="flex items-center gap-2">
                    <TextInput
                      aria-label="Tempo do treino em minutos"
                      type="number"
                      min={0}
                      max={180}
                      placeholder="min"
                      value={editedDuration}
                      onChange={(e) => setEditedDuration(e.target.value)}
                      className="w-24 px-3 py-2 text-sm"
                    />
                    <span className="text-sm text-neutral-500">
                      minutos (time cap para FOR_TIME/CHIPPER, ou duração do AMRAP)
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600">
                    Alterar o tempo apaga a estratégia já gerada, já que ela depende dele.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setEditingDuration(false)}
                      disabled={savingDuration}
                      variant="secondary"
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => void handleSaveDuration()}
                      disabled={blocked}
                      className="flex-1"
                    >
                      {savingDuration ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              )}

              <div ref={loadEditor}>
                <WodLoadEditor
                  key={`loads-${analysis.versionId ?? analysisRevision}`}
                  wodId={wod.id}
                  analysis={analysis}
                  editing={editingLoads}
                  disabled={blocked || editing || editingDuration}
                  onEditingChange={setEditingLoads}
                  onSavingChange={(value) => {
                    if (active.current) setSavingLoads(value);
                  }}
                  onSaved={(updated) => {
                    if (!active.current) return;
                    setAnalysis(updated);
                    setAnalysisRevision((value) => value + 1);
                    setStrategy(null);
                  }}
                />
              </div>

              {analysis.stimulus && (
                <p className="text-sm text-neutral-400">Estímulo: {analysis.stimulus}</p>
              )}

              <WorkoutDetails analysis={analysis} />

              <p className="text-xs text-neutral-600">
                Confiança da análise: {Math.round(analysis.confidence * 100)}%
              </p>
              {analysisError && <Alert>{analysisError}</Alert>}
              {analysisStatus && <WodGenerationProgress message={analysisStatus} />}
              <Button
                onClick={() => void handleAnalyze()}
                disabled={blocked || editing || editingDuration || editingLoads}
                variant="secondary"
                fullWidth
              >
                {analyzing ? 'Reanalisando...' : 'Reanalisar treino'}
              </Button>
            </div>
          )}

          {analysis && (
            <AthleteContextSection
              key={`context-${analysis.versionId ?? analysisRevision}`}
              wodId={wod.id}
            />
          )}

          {analysis && readErrors.length === 0 && !analyzing && !saving && !savingDuration && (
            <StrategySection
              key={`strategy-${analysis.versionId ?? analysisRevision}`}
              wodId={wod.id}
              initialStrategy={strategy}
              analysis={analysis}
              workoutName={wod.name}
              disabled={blocked || editing || editingDuration || editingLoads}
              reviewRequired={needsReview}
              onGeneratingChange={(generating) => {
                if (active.current) setGeneratingStrategy(generating);
              }}
              onStrategyGenerated={(generated) => {
                if (!active.current) return;
                setStrategy(generated);
              }}
            />
          )}

          <WodResultSection
            wodId={wod.id}
            analysis={analysis}
            initialResult={(wod.result as WodResult | null | undefined) ?? null}
            onResultSaved={(result) =>
              setWod((current) => (current ? { ...current, result } : current))
            }
          />
        </div>
      )}
    </PageShell>
  );
}
