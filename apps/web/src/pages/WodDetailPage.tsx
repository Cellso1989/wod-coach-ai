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

function DemandBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span>{value}/10</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-800">
        <div
          className="h-2 rounded-full bg-orange-600"
          style={{ width: `${(value / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function WodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [wod, setWod] = useState<Wod | null>(null);
  const [analysis, setAnalysis] = useState<WodAnalysis | null>(null);
  const [strategy, setStrategy] = useState<WodStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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

  async function handleAnalyze() {
    if (!id) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const { analysis } = await api.analyzeWod(id);
      setAnalysis(analysis);
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
          <Link to="/wods" className="text-sm text-neutral-400">
            Voltar
          </Link>
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

            {wod.rawText && (
              <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
                {wod.rawText}
              </pre>
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
                  {analyzing ? "Analisando..." : "🔍 Analisar treino"}
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

                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-neutral-300">Demanda estimada</h2>
                  <DemandBar label="Engine" value={analysis.engineDemand} />
                  <DemandBar label="Grip" value={analysis.gripDemand} />
                  <DemandBar label="Pernas" value={analysis.legDemand} />
                  <DemandBar label="Ginástica" value={analysis.gymnasticsDemand} />
                  <DemandBar label="Técnica" value={analysis.technicalDemand} />
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
