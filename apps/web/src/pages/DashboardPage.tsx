import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DailyCheckin, type Wod } from '../lib/api.js';
import { useAuth } from '../lib/auth-context.js';
import { NavBar } from '../components/NavBar.js';
import { LogoutButton } from '../components/LogoutButton.js';
import { TrainingCalendar } from '../components/TrainingCalendar.js';
import { PageHeader } from '../components/PageHeader.js';
import { ButtonLink, Card, LoadingState, PageShell } from '../components/ui.js';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.getTodayCheckin().then(({ checkin }) => setCheckin(checkin)),
      api.listWods(20).then(({ wods }) => setRecentWods(wods)),
    ]).finally(() => setLoading(false));
  }, []);

  const todayWod = recentWods.find((wod) => isToday(wod.date));
  const lastResultWod = recentWods.find((wod) => wod.result);
  const otherRecentWods = recentWods.filter((wod) => wod.id !== todayWod?.id).slice(0, 3);

  if (loading) {
    return <LoadingState message="Carregando seu painel..." />;
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">WOD Coach AI</h1>
            <p className="text-sm text-neutral-500">Ola, {user?.name}</p>
          </div>
          <LogoutButton />
        </div>
      </PageHeader>

      <NavBar />

      <TrainingCalendar />

      <Card className="space-y-4 border-orange-900/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Painel de hoje</p>
            <h2 className="text-lg font-semibold">
              {todayWod ? (todayWod.name ?? 'WOD de hoje') : 'WOD de hoje'}
            </h2>
          </div>
          {checkin && (
            <span className="whitespace-nowrap rounded-full bg-neutral-950 px-2 py-1 text-xs text-neutral-400">
              Check-in ok
            </span>
          )}
        </div>

        {todayWod ? (
          <div className="space-y-3">
            <p className="line-clamp-3 text-sm text-neutral-400">
              {todayWod.rawText ?? todayWod.notes ?? 'Abra o treino para revisar a estrategia.'}
            </p>
            <ButtonLink to={`/wods/${todayWod.id}`} fullWidth>
              {todayWod.result ? 'Ver treino de hoje' : 'Abrir estrategia'}
            </ButtonLink>
          </div>
        ) : (
          <div className="grid gap-2">
            <ButtonLink to="/wods/new" fullWidth>
              Enviar WOD
            </ButtonLink>
            <ButtonLink to="/personal-records" variant="secondary" fullWidth>
              Meus PR's
            </ButtonLink>
          </div>
        )}

        <div className="border-t border-neutral-800 pt-3 text-center">
          <div>
            <p className="text-lg font-bold">{recentWods.length}</p>
            <p className="text-xs text-neutral-500">Wod's Realizados</p>
          </div>
        </div>
      </Card>

      {lastResultWod && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Ultimo resultado</p>
              <p className="truncate font-semibold">{lastResultWod.name ?? 'WOD sem nome'}</p>
              <p className="text-sm text-orange-400">{lastResultWod.result?.score}</p>
            </div>
            <Link to={`/wods/${lastResultWod.id}`} className="shrink-0 text-sm text-orange-500">
              Abrir
            </Link>
          </div>
        </Card>
      )}

      {otherRecentWods.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Recentes
            </h2>
            <Link to="/wods" className="text-sm text-orange-500">
              Historico
            </Link>
          </div>
          <ul className="space-y-2">
            {otherRecentWods.map((wod) => (
              <li key={wod.id}>
                <Link
                  to={`/wods/${wod.id}`}
                  className="block rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{wod.name ?? 'WOD sem nome'}</span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {new Date(wod.date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  {wod.result && <p className="mt-1 text-xs text-orange-400">{wod.result.score}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
