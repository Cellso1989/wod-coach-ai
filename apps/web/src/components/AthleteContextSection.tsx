import { useState } from "react";
import { api, ApiError, type AthleteContext } from "../lib/api.js";

const TREND_LABEL: Record<AthleteContext["readinessTrend"], string> = {
  improving: "📈 Melhorando",
  stable: "➡️ Estável",
  declining: "📉 Caindo",
  insufficient_data: "Dados insuficientes",
};

const SUFFICIENCY_LABEL: Record<AthleteContext["dataSufficiency"], string> = {
  low: "Baixa (poucos dados históricos)",
  moderate: "Moderada",
  high: "Alta",
};

export function AthleteContextSection({ wodId }: { wodId: string }) {
  const [context, setContext] = useState<AthleteContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const { context } = await api.getAthleteContext(wodId);
      setContext(context);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível carregar seu histórico.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!context) {
    return (
      <div className="space-y-2">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={() => void handleLoad()}
          disabled={loading}
          className="w-full rounded-lg border border-neutral-700 py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Carregando..." : "📊 Ver meu histórico com esse tipo de treino"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">Seu histórico</h2>
        <span className="text-xs text-neutral-500">
          Confiabilidade dos dados: {SUFFICIENCY_LABEL[context.dataSufficiency]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: "7 dias", window: context.trainingLoad.last7Days },
          { label: "14 dias", window: context.trainingLoad.last14Days },
          { label: "28 dias", window: context.trainingLoad.last28Days },
        ].map(({ label, window }) => (
          <div key={label} className="rounded-lg bg-neutral-800 p-2">
            <p className="text-neutral-500">{label}</p>
            <p className="text-lg font-bold">{window.sessionCount}</p>
            <p className="text-neutral-500">treinos</p>
            {window.averageRpe != null && <p className="text-neutral-400">RPE {window.averageRpe.toFixed(1)}</p>}
          </div>
        ))}
      </div>

      <p className="text-sm text-neutral-400">
        Tendência de readiness: <span className="font-medium">{TREND_LABEL[context.readinessTrend]}</span>
      </p>

      {context.relevantPersonalRecords.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-neutral-400">PRs relevantes</h3>
          {context.relevantPersonalRecords.map((pr) => (
            <p key={pr.movementName} className="text-sm">
              {pr.movementName}: {pr.value} {pr.unit}
            </p>
          ))}
        </div>
      )}

      {context.similarWods.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400">Treinos parecidos que você já fez</h3>
          <ul className="space-y-2">
            {context.similarWods.map((match) => (
              <li key={match.wodId} className="rounded-lg bg-neutral-800 p-2 text-sm">
                <div className="flex justify-between text-neutral-400">
                  <span>{new Date(match.date).toLocaleDateString("pt-BR")}</span>
                  <span>{Math.round(match.similarityScore * 100)}% parecido</span>
                </div>
                {match.result && (
                  <p>
                    {match.result.score} · RPE {match.result.rpe}
                  </p>
                )}
                {match.feedback?.whereItBroke && (
                  <p className="text-yellow-400">Quebrou em: {match.feedback.whereItBroke}</p>
                )}
                {match.previousStrategy && (
                  <p className="mt-1 text-neutral-500">
                    Estratégia daquele dia: RPE alvo {match.previousStrategy.targetRpe}
                    {match.previousStrategy.breakStrategy[0] &&
                      ` · ${match.previousStrategy.breakStrategy[0].movement}: ${match.previousStrategy.breakStrategy[0].strategy}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          Ainda não há treinos parecidos o suficiente no seu histórico.
        </p>
      )}
    </div>
  );
}
