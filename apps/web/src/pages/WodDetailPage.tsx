import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type Wod,
  type WodAnalysis,
  type WodResult,
  type WodStrategy,
} from "../lib/api.js";
import { WodResultSection } from "../components/WodResultSection.js";
import { AthleteContextSection } from "../components/AthleteContextSection.js";
import { StrategySection } from "../components/StrategySection.js";
import { BrandHomeLink } from "../components/BrandHomeLink.js";

const FORMAT_LABEL: Record<NonNullable<WodAnalysis["format"]>, string> = {
  AMRAP: "AMRAP",
  FOR_TIME: "For Time",
  EMOM: "EMOM",
  E2MOM: "E2MOM",
  CHIPPER: "Chipper",
  ROUNDS_FOR_TIME: "Rounds For Time",
  STRENGTH: "Strength",
  INTERVAL: "Intervalos",
};

const CATEGORY_ICON: Record<string, string> = {
  gymnastics: "🤸",
  weightlifting: "🏋️",
  conditioning: "🔥",
  monostructural: "🏃",
  mixed_modal: "⚙️",
};

export function WodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [wod, setWod] = useState<Wod | null>(null);
  const [analysis, setAnalysis] = useState<WodAnalysis | null>(null);
  const [strategy, setStrategy] = useState<WodStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getWod(id)
      .then(({ wod }) => setWod(wod))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erro ao carregar."))
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
    setEditedText(wod?.rawText ?? "");
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
      setSaveError(err instanceof ApiError ? err.message : "Não foi possível salvar a edição.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalyze() {
    if (!id) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const { analysis } = await api.analyzeWod(id);
      setAnalysis(analysis);
      try {
        const { strategy } = await api.generateStrategy(id);
        setStrategy(strategy);
      } catch {
        // A análise deu certo, só a estratégia falhou — o usuário ainda
        // consegue gerá-la manualmente pelo botão que aparece abaixo.
      }
    } catch (err) {
      setAnalysisError(
        err instanceof ApiError ? err.message : "Não foi possível analisar este WOD.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{wod?.name ?? "WOD"}</h1>
          <div className="flex items-center gap-3">
            <BrandHomeLink />
            <Link to="/wods" className="text-sm text-neutral-400">
              Voltar
            </Link>
          </div>
        </div>

        {loading && <p className="text-neutral-400">Carregando...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {wod && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-500">
              {new Date(wod.date).toLocaleDateString("pt-BR")}
            </p>

            {wod.imageData && wod.imageMimeType && (
              <img
                src={`data:${wod.imageMimeType};base64,${wod.imageData}`}
                alt="Foto do treino"
                className="w-full rounded-lg border border-neutral-800"
              />
            )}

            {wod.rawText && !editing && (
              <div className="space-y-2">
                <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
                  {wod.rawText}
                </pre>
                <button
                  onClick={startEditing}
                  className="w-full rounded-lg border border-neutral-700 py-2 text-sm text-neutral-300"
                >
                  ✏️ Editar
                </button>
              </div>
            )}

            {editing && (
              <div className="space-y-2">
                {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 font-mono text-sm"
                />
                <p className="text-xs text-neutral-600">
                  Editar o texto apaga a análise e a estratégia já geradas para este WOD.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm text-neutral-300 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handleSaveEdit()}
                    disabled={saving || !editedText.trim()}
                    className="flex-1 rounded-lg bg-orange-600 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            )}

            {wod.notes && <p className="text-sm text-neutral-400">Notas: {wod.notes}</p>}

            {!analysis && (
              <div className="space-y-2">
                {analysisError && <p className="text-red-400 text-sm">{analysisError}</p>}
                <button
                  onClick={() => void handleAnalyze()}
                  disabled={analyzing}
                  className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
                >
                  {analyzing ? "Analisando e montando estratégia..." : "🔍 Analisar treino"}
                </button>
              </div>
            )}

            {analysis && (
              <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-orange-600/20 px-3 py-1 text-sm font-semibold text-orange-400">
                    {analysis.format ? FORMAT_LABEL[analysis.format] : "Formato não identificado"}
                  </span>
                  {analysis.durationMinutes != null && (
                    <span className="text-sm text-neutral-400">
                      {analysis.durationMinutes} min
                    </span>
                  )}
                </div>

                {analysis.stimulus && (
                  <p className="text-sm text-neutral-400">Estímulo: {analysis.stimulus}</p>
                )}

                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-neutral-300">Movimentos</h2>
                  <ul className="space-y-1">
                    {analysis.movements.map((movement) => (
                      <li key={movement.id} className="flex items-center gap-2 text-sm">
                        <span>{CATEGORY_ICON[movement.category] ?? "•"}</span>
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

                <p className="text-xs text-neutral-600">
                  Confiança da análise: {Math.round(analysis.confidence * 100)}%
                </p>
              </div>
            )}

            {analysis && <AthleteContextSection wodId={wod.id} />}

            {analysis && <StrategySection wodId={wod.id} initialStrategy={strategy} />}

            <WodResultSection
              wodId={wod.id}
              initialResult={(wod.result as WodResult | null | undefined) ?? null}
            />
          </div>
        )}
      </div>
    </main>
  );
}
