import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  type TreadmillEffort,
  type TreadmillSession,
  type TreadmillWorkout,
} from "../lib/api.js";
import { BrandHomeLink } from "../components/BrandHomeLink.js";

const EFFORT_LABELS: Record<TreadmillEffort, string> = {
  leve: "Leve",
  moderado: "Moderado",
  moderado_alto: "Moderado alto",
  forte: "Forte",
  maximo: "Máximo",
};

const EFFORT_COLORS: Record<TreadmillEffort, string> = {
  leve: "bg-blue-600/20 text-blue-400",
  moderado: "bg-green-600/20 text-green-400",
  moderado_alto: "bg-yellow-600/20 text-yellow-400",
  forte: "bg-orange-600/20 text-orange-400",
  maximo: "bg-red-600/20 text-red-400",
};

function EffortBadge({ effort }: { effort: TreadmillEffort }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${EFFORT_COLORS[effort]}`}
    >
      {EFFORT_LABELS[effort]}
    </span>
  );
}

export function TreadmillPage() {
  const navigate = useNavigate();

  const [level, setLevel] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [workout, setWorkout] = useState<TreadmillWorkout | null>(null);

  const [distanceKm, setDistanceKm] = useState("");
  const [notes, setNotes] = useState("");

  const [sessions, setSessions] = useState<TreadmillSession[]>([]);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadHistory() {
    api
      .listTreadmillSessions(10)
      .then(({ sessions }) => setSessions(sessions))
      .catch(() => {
        // Sem histórico ainda ou falha silenciosa — não bloqueia a página.
      });
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleGenerate() {
    setError(null);
    setSavedMessage(null);
    setGenerating(true);
    try {
      const duration = Number(durationMinutes);
      const { workout } = await api.generateTreadmillWorkout({ level, durationMinutes: duration });
      setWorkout(workout);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível gerar o treino.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!workout) return;
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      await api.saveTreadmillSession({
        level: workout.level,
        durationMinutes: workout.durationMinutes,
        blocks: workout.blocks,
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        notes: notes || undefined,
      });
      setSavedMessage("Treino salvo com sucesso.");
      setDistanceKm("");
      setNotes("");
      loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o treino.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Treino de esteira</h1>
          <div className="flex gap-3">
            <BrandHomeLink />
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-sm text-neutral-400"
            >
              Voltar
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Nível</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition-colors duration-150 ${
                    level === lvl
                      ? "border-orange-600 bg-orange-600/10 text-orange-400"
                      : "border-neutral-800 bg-neutral-950 text-neutral-100 hover:border-orange-900/60"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Duração (min)</label>
            <input
              type="number"
              min={5}
              max={60}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-4 py-3"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded-lg bg-orange-600 py-3 font-semibold transition-colors duration-150 hover:bg-orange-700 active:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Gerando..." : "Gerar treino"}
          </button>
        </div>

        {workout && (
          <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="text-sm font-semibold text-neutral-300">
              Nível {workout.level} — {workout.durationMinutes} min
            </h2>

            <div className="space-y-2">
              {workout.blocks.map((block, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
                >
                  <span className="text-sm text-neutral-300 whitespace-nowrap">
                    {block.startMinute}&apos;-{block.endMinute}&apos;
                  </span>
                  <span className="text-sm font-medium">{block.speedRange} km/h</span>
                  <EffortBadge effort={block.effort} />
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t border-neutral-800 pt-4">
              {savedMessage && <p className="text-green-400 text-sm">{savedMessage}</p>}

              <input
                type="number"
                step="0.1"
                min={0}
                placeholder="Distância (km) — opcional"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-4 py-3"
              />
              <textarea
                placeholder="Observações — opcional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-4 py-3"
              />

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-lg bg-orange-600 py-3 font-semibold transition-colors duration-150 hover:bg-orange-700 active:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar treino"}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-300">Histórico</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum treino salvo ainda.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span>{new Date(session.date).toLocaleDateString("pt-BR")}</span>
                    <span className="text-neutral-400">
                      Nível {session.level} · {session.durationMinutes} min
                      {session.distanceKm != null ? ` · ${session.distanceKm} km` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
