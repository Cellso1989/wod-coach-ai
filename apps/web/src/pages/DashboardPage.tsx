import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DailyCheckin, type PersonalRecord, type Wod } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";
import { NavBar } from "../components/NavBar.js";
import { LogoutButton } from "../components/LogoutButton.js";

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [recentWods, setRecentWods] = useState<Wod[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTodayCheckin()
      .then(({ checkin }) => setCheckin(checkin))
      .catch(() => setCheckin(null));

    api
      .listWods()
      .then(({ wods }) => setRecentWods(wods))
      .catch(() => setRecentWods([]));

    api
      .listPersonalRecords()
      .then(({ records }) => setRecords(records))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const todayWod = recentWods.find((w) => isToday(w.date));
  const otherRecentWods = recentWods.filter((w) => w !== todayWod).slice(0, 3);

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">WOD Coach AI</h1>
            <p className="text-sm text-neutral-500">Olá, {user?.name}</p>
          </div>
          <LogoutButton />
        </div>

        <NavBar />

        {/* Prontidão de hoje */}
        {checkin ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-lg font-semibold">
              🏋️ E aí, meu atleta! Me manda seu WOD pra análise.
            </p>
            {checkin.cautionFlags.length > 0 && (
              <ul className="mt-2 space-y-1 text-left text-xs text-yellow-300">
                {checkin.cautionFlags.map((flag) => (
                  <li key={flag}>⚠ {flag}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Link
            to="/checkin"
            className="block rounded-lg bg-orange-600 py-4 text-center font-bold"
          >
            📋 Fazer check-in de hoje
          </Link>
        )}

        {/* Treino de hoje */}
        {todayWod ? (
          <Link
            to={`/wods/${todayWod.id}`}
            className="block rounded-lg border border-orange-900/50 bg-neutral-900 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-neutral-500">Treino de hoje</p>
            <p className="text-lg font-semibold">{todayWod.name ?? "WOD sem nome"}</p>
            {todayWod.result ? (
              <p className="text-sm text-orange-400">
                {todayWod.result.score} · RPE {todayWod.result.rpe}
              </p>
            ) : (
              <p className="text-sm text-neutral-400">Ver estratégia e registrar resultado →</p>
            )}
          </Link>
        ) : (
          <Link to="/wods/new" className="block rounded-lg bg-orange-600 py-4 text-center font-bold">
            💪 Enviar o WOD de hoje
          </Link>
        )}

        {/* Últimos resultados */}
        {otherRecentWods.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Últimos treinos
            </h2>
            <ul className="space-y-2">
              {otherRecentWods.map((wod) => (
                <li key={wod.id}>
                  <Link
                    to={`/wods/${wod.id}`}
                    className="block rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{wod.name ?? "WOD sem nome"}</span>
                      <span className="text-xs text-neutral-500">
                        {new Date(wod.date).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {wod.result && (
                      <p className="mt-1 text-xs text-orange-400">
                        {wod.result.score} · RPE {wod.result.rpe}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PRs */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">Personal Records</p>
            <Link to="/personal-records" className="text-sm text-orange-500">
              Ver todos
            </Link>
          </div>
          <p className="text-2xl font-bold">{records.length}</p>
        </div>
      </div>
    </main>
  );
}
