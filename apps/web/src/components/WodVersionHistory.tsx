import { useEffect, useRef, useState } from 'react';
import { History, RefreshCw, X } from 'lucide-react';
import { api, type WodVersion, type WodVersions } from '../lib/api.js';
import { Button } from './ui.js';

const LABELS: Record<string, string> = {
  rawText: 'Texto',
  sourceType: 'Tipo de fonte',
  name: 'Nome',
  notes: 'Notas',
  date: 'Data',
  format: 'Formato',
  durationMinutes: 'Duracao (min)',
  stimulus: 'Estimulo',
  estimatedIntensity: 'Intensidade estimada',
  confidence: 'Confianca',
  warnings: 'Avisos',
  movements: 'Movimentos',
  roundBreakdown: 'Rounds',
  roundNumber: 'Round',
  label: 'Bloco',
  category: 'Categoria',
  reps: 'Repeticoes',
  distanceMeters: 'Distancia (m)',
  calories: 'Calorias',
  loadDescription: 'Carga',
  recommendedIntensity: 'Intensidade recomendada',
  targetRpe: 'RPE alvo',
  loadRecommendation: 'Recomendacao de carga',
  pacing: 'Ritmo',
  breakStrategy: 'Quebras',
  movement: 'Movimento',
  strategy: 'Orientacao',
  restStrategy: 'Descanso',
  movementStrategy: 'Execucao dos movimentos',
  transitionStrategy: 'Transicoes',
  energyManagement: 'Gestao de energia',
  goal: 'Objetivo',
  target: 'Meta',
  criticalPoint: 'Ponto critico',
  engineDemand: 'Demanda de engine',
  gripDemand: 'Demanda de grip',
  legDemand: 'Demanda de pernas',
  gymnasticsDemand: 'Demanda ginastica',
  technicalDemand: 'Demanda tecnica',
  profile: 'Perfil',
  athleteContext: 'Contexto do atleta',
  context: 'Contexto',
  analysis: 'Analise',
  trainingLoad: 'Carga de treino',
  personalRecords: 'Recordes pessoais',
  similarWods: 'Treinos semelhantes',
  dataSufficiency: 'Suficiencia dos dados',
  sessionCount: 'Sessoes',
  days: 'Dias',
  value: 'Valor',
  unit: 'Unidade',
  achievedAt: 'Data do recorde',
};
const TECHNICAL = new Set([
  'id',
  'wodId',
  'order',
  'createdAt',
  'updatedAt',
  'rawResponse',
  'generationMetadata',
  'imageMimeType',
]);

// Preserve unknown/legacy fields without applying today's stricter AI output schema.
function Snapshot({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-neutral-500">Nao registrado</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul className="space-y-3">
        {value.map((entry, i) => (
          <li key={i} className="border-l border-neutral-700 pl-3">
            <Snapshot value={entry} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-neutral-500">Nenhum registro</span>
    );
  if (typeof value !== 'object')
    return (
      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{String(value)}</p>
    );
  const entries = Object.entries(value);
  const technical = entries.filter(([key]) => TECHNICAL.has(key));
  const source = value as Record<string, unknown>;
  return (
    <div className="min-w-0 space-y-3">
      {typeof source.imageData === 'string' &&
        typeof source.imageMimeType === 'string' &&
        /^image\/(png|jpeg|webp|gif)$/.test(source.imageMimeType) && (
          <img
            src={`data:${source.imageMimeType};base64,${source.imageData}`}
            alt="Fonte arquivada do treino"
            className="max-h-96 max-w-full object-contain"
          />
        )}
      <dl className="space-y-3">
        {entries
          .filter(([key]) => !TECHNICAL.has(key) && key !== 'imageData')
          .map(([key, entry]) => (
            <div key={key} className="min-w-0">
              <dt className="mb-1 text-xs font-semibold text-neutral-400 [overflow-wrap:anywhere]">
                {LABELS[key] ?? key}
              </dt>
              <dd className="min-w-0 text-sm">
                <Snapshot value={entry} />
              </dd>
            </div>
          ))}
      </dl>
      {technical.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-neutral-400">Dados tecnicos</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs [overflow-wrap:anywhere]">
            {JSON.stringify(Object.fromEntries(technical), null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export function WodVersionHistory({
  wodId,
  analysisVersionId,
  strategyVersionId,
}: {
  wodId: string;
  analysisVersionId?: string | null;
  strategyVersionId?: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<WodVersions | null>(null);
  const [tab, setTab] = useState<'analysis' | 'strategy'>('analysis');
  const [selected, setSelected] = useState({ analysis: '', strategy: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else {
      dialog.current?.close();
      controller.current?.abort();
    }
  }, [open]);

  async function load(older = false) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    const cursor = tab === 'analysis' ? data?.nextAnalysisBefore : data?.nextStrategyBefore;
    try {
      const result = await api.getWodVersions(
        wodId,
        older && cursor != null
          ? { [tab === 'analysis' ? 'analysisBefore' : 'strategyBefore']: cursor }
          : {},
        request.signal,
      );
      if (request.signal.aborted) return;
      setData((previous) => {
        if (!older || !previous) return result;
        const key = tab === 'analysis' ? 'analysisVersions' : 'strategyVersions';
        const cursorKey = tab === 'analysis' ? 'nextAnalysisBefore' : 'nextStrategyBefore';
        const versions = new Map(
          [...previous[key], ...result[key]].map((version) => [version.id, version]),
        );
        return { ...previous, [key]: [...versions.values()], [cursorKey]: result[cursorKey] };
      });
      if (!older)
        setSelected({
          analysis: result.analysisVersions[0]?.id ?? '',
          strategy: result.strategyVersions[0]?.id ?? '',
        });
    } catch (err) {
      if (!request.signal.aborted)
        setError(err instanceof Error ? err.message : 'Falha ao consultar historico');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  const versions = (tab === 'analysis' ? data?.analysisVersions : data?.strategyVersions) ?? [];
  const version: WodVersion | undefined = versions.find((item) => item.id === selected[tab]);
  const cursor = tab === 'analysis' ? data?.nextAnalysisBefore : data?.nextStrategyBefore;
  const linked = data?.analysisVersions.find((item) => item.id === version?.analysisVersionId);

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
          setData(null);
          void load();
        }}
      >
        <History size={18} aria-hidden="true" />
        Historico de versoes
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="wod-history-title"
        onClose={() => setOpen(false)}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-4 text-neutral-100 backdrop:bg-black/70"
      >
        <header className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950 px-4 pb-2 pt-4">
          <h2 id="wod-history-title" className="text-lg font-semibold">
            Historico de versoes
          </h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              title="Atualizar historico"
              aria-label="Atualizar historico"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={18} />
            </Button>
            <Button
              variant="ghost"
              title="Fechar historico"
              aria-label="Fechar historico"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </Button>
          </div>
        </header>
        <div
          role="tablist"
          aria-label="Tipo de versao"
          className="mb-4 flex border-b border-neutral-700"
        >
          {(['analysis', 'strategy'] as const).map((kind) => (
            <button
              key={kind}
              role="tab"
              tabIndex={tab === kind ? 0 : -1}
              aria-selected={tab === kind}
              aria-controls="history-panel"
              id={`history-tab-${kind}`}
              className={`min-h-11 flex-1 border-b-2 px-3 text-sm ${tab === kind ? 'border-orange-500 text-neutral-100' : 'border-transparent text-neutral-400'}`}
              onClick={() => setTab(kind)}
              onKeyDown={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 'analysis'
                      : event.key === 'End'
                        ? 'strategy'
                        : tab === 'analysis'
                          ? 'strategy'
                          : 'analysis';
                  setTab(next);
                  dialog.current?.querySelector<HTMLButtonElement>(`#history-tab-${next}`)?.focus();
                }
              }}
            >
              {kind === 'analysis' ? 'Analises' : 'Estrategias'}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-400">
            {error}
          </p>
        )}
        {loading && (
          <p role="status" className="mb-3 text-sm text-neutral-400">
            Carregando...
          </p>
        )}
        <section
          id="history-panel"
          role="tabpanel"
          aria-labelledby={`history-tab-${tab}`}
          className="min-w-0 space-y-4"
        >
          {data && versions.length === 0 && (
            <p className="text-sm text-neutral-400">Nenhuma versao arquivada.</p>
          )}
          {versions.length > 0 && (
            <label className="block text-sm">
              Versao
              <select
                aria-label="Versao"
                className="mt-1 min-h-11 w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                value={selected[tab]}
                onChange={(event) =>
                  setSelected((previous) => ({ ...previous, [tab]: event.target.value }))
                }
              >
                {versions.map((item) => (
                  <option key={item.id} value={item.id}>
                    v{item.version} - {new Date(item.createdAt).toLocaleString('pt-BR')}
                    {item.id === (tab === 'analysis' ? analysisVersionId : strategyVersionId)
                      ? ' - Ativa'
                      : ''}
                    {item.reason
                      ? ` - ${item.reason === 'DURATION_EDIT' ? 'Duracao editada' : item.reason === 'LOAD_EDIT' ? 'Carga editada' : item.reason === 'LEGACY' ? 'Legado' : item.reason}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {version && (
            <>
              {tab === 'strategy' && (
                <p className="break-words text-sm text-neutral-400">
                  {version.analysisVersionId
                    ? `Analise vinculada: ${linked ? `v${linked.version}` : version.analysisVersionId}`
                    : 'Analise vinculada nao registrada (legado)'}
                </p>
              )}
              <section className="border-t border-neutral-800 pt-3">
                <h3 className="mb-3 font-semibold">Fonte arquivada</h3>
                <Snapshot value={version.sourceSnapshot} />
              </section>
              <section className="border-t border-neutral-800 pt-3">
                <h3 className="mb-3 font-semibold">
                  {tab === 'analysis' ? 'Analise arquivada' : 'Estrategia arquivada'}
                </h3>
                <Snapshot value={version.snapshot} />
              </section>
              {tab === 'strategy' && (
                <details className="border-t border-neutral-800 pt-3">
                  <summary className="cursor-pointer font-semibold">Contexto arquivado</summary>
                  <div className="mt-3">
                    <Snapshot value={version.inputSnapshot} />
                  </div>
                </details>
              )}
            </>
          )}
          {cursor != null && (
            <Button variant="secondary" disabled={loading} onClick={() => void load(true)}>
              Carregar versoes anteriores
            </Button>
          )}
        </section>
      </dialog>
    </>
  );
}
