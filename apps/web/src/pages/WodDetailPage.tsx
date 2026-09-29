import { useEffect, useState } from 'react';
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

const CATEGORY_ICON: Record<string, string> = {
  gymnastics: '🤸',
  weightlifting: '🏋️',
  conditioning: '🔥',
  monostructural: '🏃',
  mixed_modal: '⚙️',
};

function WodFlowCard({
  hasText,
  hasAnalysis,
  hasStrategy,
  hasResult,
}: {
  hasText: boolean;
  hasAnalysis: boolean;
  hasStrategy: boolean;
  hasResult: boolean;
}) {
  const steps = [
    { label: 'WOD recebido', done: hasText },
    { label: 'Análise', done: hasAnalysis },
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
  const [durationError, setDurationError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getWod(id)
      .then(({ wod }) => setWod(wod))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));

    api
      .getWodAnalysis(id)
      .then(({ analysis }) => setAnalysis(analysis))
      .catch(() => {
        // Ainda não analisado — botão "Analisar" fica disponível.
      });

    api
      .getStrategy(id)
      .then(({ strategy }) => setStrategy(strategy))
      .catch(() => {
        // Ainda sem estratégia — botão "Gerar estratégia" fica disponível.
      });
  }, [id]);

  function startEditing() {
    setEditedText(wod?.rawText ?? '');
    setSaveError(null);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { wod: updated } = await api.updateWod(id, { rawText: editedText.trim() });
      setWod(updated);
      if (updated.rawText !== wod?.rawText) {
        setAnalysis(null);
        setStrategy(null);
      }
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Não foi possível salvar a edição.');
    } finally {
      setSaving(false);
    }
  }

  function startEditingDuration() {
    setEditedDuration(analysis?.durationMinutes != null ? String(analysis.durationMinutes) : '');
    setDurationError(null);
    setEditingDuration(true);
  }

  async function handleSaveDuration() {
    if (!id) return;
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
      setAnalysis(updated);
      setStrategy(null);
      setEditingDuration(false);
    } catch (err) {
      setDurationError(err instanceof ApiError ? err.message : 'Não foi possível salvar o tempo.');
    } finally {
      setSavingDuration(false);
    }
  }

  async function handleDeleteWod() {
    if (!id) return;
    const confirmed = window.confirm(
      'Apagar este WOD? Essa acao nao pode ser desfeita e tambem remove analise, estrategia e resultado.',
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteWod(id);
      navigate('/wods', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Nao foi possivel apagar o WOD.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAnalyze() {
    if (!id) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus('Lendo o WOD e identificando movimentos...');
    try {
      const { analysis, wod: updatedWod } = await api.analyzeWod(id);
      setAnalysis(analysis);
      setStrategy(null);
      if (updatedWod) setWod(updatedWod);
      try {
        setAnalysisStatus('Montando estratégia com base no seu histórico...');
        const { strategy } = await api.generateStrategy(id);
        setStrategy(strategy);
      } catch {
        // A análise deu certo, só a estratégia falhou — o usuário ainda
        // consegue gerá-la manualmente pelo botão que aparece abaixo.
      }
    } catch (err) {
      setAnalysisError(
        err instanceof ApiError ? err.message : 'Não foi possível analisar este WOD.',
      );
    } finally {
      setAnalyzing(false);
      setAnalysisStatus(null);
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

      {loading && <p className="text-neutral-400">Carregando...</p>}
      {error && <Alert>{error}</Alert>}

      {wod && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            {new Date(wod.date).toLocaleDateString('pt-BR')}
          </p>

          {wod.imageData && wod.imageMimeType && (
            <img
              src={`data:${wod.imageMimeType};base64,${wod.imageData}`}
              alt="Foto do treino"
              className="w-full rounded-lg border border-neutral-800"
            />
          )}

          {!editing && (
            <div className="space-y-2">
              {wod.rawText && (
                <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
                  {wod.rawText}
                </pre>
              )}
              {deleteError && <Alert>{deleteError}</Alert>}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={startEditing} disabled={deleting} variant="secondary">
                  {wod.rawText ? 'Editar' : 'Adicionar texto'}
                </Button>
                <Button onClick={() => void handleDeleteWod()} disabled={deleting} variant="danger">
                  {deleting ? 'Apagando...' : 'Apagar'}
                </Button>
              </div>
            </div>
          )}

          {editing && (
            <div className="space-y-2">
              {saveError && <Alert>{saveError}</Alert>}
              <TextArea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-neutral-600">
                Editar o texto apaga a análise e a estratégia já geradas para este WOD.
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
                  disabled={saving || !editedText.trim()}
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
            hasStrategy={Boolean(strategy)}
            hasResult={Boolean(wod.result)}
          />

          {!analysis && (
            <div className="space-y-2">
              {analysisError && <Alert>{analysisError}</Alert>}
              {analysisStatus && <Alert variant="info">{analysisStatus}</Alert>}
              <Button onClick={() => void handleAnalyze()} disabled={analyzing} fullWidth>
                {analyzing ? 'Trabalhando no treino...' : 'Analisar treino'}
              </Button>
            </div>
          )}

          {analysis && (
            <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-orange-600/20 px-3 py-1 text-sm font-semibold text-orange-400">
                  {analysis.format ? FORMAT_LABEL[analysis.format] : 'Formato não identificado'}
                </span>
                {!editingDuration && (
                  <button
                    onClick={startEditingDuration}
                    className="text-sm text-neutral-400 underline decoration-dotted"
                  >
                    {analysis.durationMinutes != null
                      ? `${analysis.durationMinutes} min ✏️`
                      : 'Definir tempo ✏️'}
                  </button>
                )}
              </div>

              {editingDuration && (
                <div className="space-y-2">
                  {durationError && <Alert>{durationError}</Alert>}
                  <div className="flex items-center gap-2">
                    <TextInput
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
                      disabled={savingDuration}
                      className="flex-1"
                    >
                      {savingDuration ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              )}

              {analysis.stimulus && (
                <p className="text-sm text-neutral-400">Estímulo: {analysis.stimulus}</p>
              )}

              {analysis.roundBreakdown && analysis.roundBreakdown.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-neutral-300">Sequência do treino</h2>
                  {analysis.roundBreakdown.map((round) => {
                    const roundLabel = round.label?.trim() || `Bloco ${round.roundNumber}`;

                    return (
                      <div key={`${round.roundNumber}-${roundLabel}`} className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">
                          {roundLabel}
                        </p>
                        <ul className="space-y-1">
                          {round.movements.map((movement, index) => (
                            <li key={index} className="flex items-center gap-2 text-sm">
                              <span>{CATEGORY_ICON[movement.category] ?? '•'}</span>
                              <span>{movement.name}</span>
                              {movement.reps != null && (
                                <span className="text-neutral-500">{movement.reps} reps</span>
                              )}
                              {movement.distanceMeters != null && (
                                <span className="text-neutral-500">{movement.distanceMeters}m</span>
                              )}
                              {movement.loadDescription && (
                                <span className="text-neutral-500">{movement.loadDescription}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-neutral-300">Movimentos</h2>
                  <ul className="space-y-1">
                    {analysis.movements.map((movement) => (
                      <li key={movement.id} className="flex items-center gap-2 text-sm">
                        <span>{CATEGORY_ICON[movement.category] ?? '•'}</span>
                        <span>{movement.name}</span>
                        {movement.reps != null && (
                          <span className="text-neutral-500">{movement.reps} reps</span>
                        )}
                        {movement.distanceMeters != null && (
                          <span className="text-neutral-500">{movement.distanceMeters}m</span>
                        )}
                        {movement.loadDescription && (
                          <span className="text-neutral-500">{movement.loadDescription}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-neutral-600">
                Confiança da análise: {Math.round(analysis.confidence * 100)}%
              </p>
              {analysisError && <Alert>{analysisError}</Alert>}
              {analysisStatus && <Alert variant="info">{analysisStatus}</Alert>}
              <Button
                onClick={() => void handleAnalyze()}
                disabled={analyzing}
                variant="secondary"
                fullWidth
              >
                {analyzing ? 'Reanalisando...' : 'Reanalisar treino'}
              </Button>
            </div>
          )}

          {analysis && <AthleteContextSection wodId={wod.id} />}

          {analysis && (
            <StrategySection
              wodId={wod.id}
              initialStrategy={strategy}
              onStrategyGenerated={setStrategy}
            />
          )}

          <WodResultSection
            wodId={wod.id}
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
