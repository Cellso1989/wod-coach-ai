import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type DailyCheckin,
  type PersonalRecord,
  type TrainingFrequencyWeek,
  type Wod,
} from '../lib/api.js';
import { useAuth } from '../lib/auth-context.js';
import { NavBar } from '../components/NavBar.js';
import { LogoutButton } from '../components/LogoutButton.js';
import { TrainingFrequencyChart } from '../components/TrainingFrequencyChart.js';
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
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [frequency, setFrequency] = useState<TrainingFrequencyWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.getTodayCheckin().then(({ checkin }) => setCheckin(checkin)),
      api.listWods(20).then(({ wods }) => setRecentWods(wods)),
      api.getTrainingFrequency(8).then(({ weeks }) => setFrequency(weeks)),
      api.listPersonalRecords().then(({ records }) => setRecords(records)),
    ]).finally(() => setLoading(false));
  }, []);

  const todayWod = recentWods.find((wod) => isToday(wod.date));
  const lastResultWod = recentWods.find((wod) => wod.result);
  const otherRecentWods = recentWods.filter((wod) => wod.id !== todayWod?.id).slice(0, 3);
  const latestRecords = useMemo(
    () =>
      [...records]
        .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
        .slice(0, 3),
    [records],
  );
  const lastFourWeeksTotal = frequency
    .slice(-4)
    .reduce((total, week) => total + week.wodCount + week.treadmillCount, 0);

  if (loading) {
    return <LoadingState message="Carregando seu painel..." />;
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">WOD Coach AI</h1>
          <p className="text-sm text-neutral-500">Ola, {user?.name}</p>
        </div>
        <LogoutButton />
      </div>

      <NavBar />

      <Card className="space-y-4 border-orange-900/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Painel de hoje</p>
            <h2 className="text-lg font-semibold">
              {todayWod ? (todayWod.name ?? 'WOD de hoje') : 'Comece pelo WOD de hoje'}
            </h2>
          </div>
          <span className="rounded-full bg-neutral-950 px-2 py-1 text-xs text-neutral-400">
            {checkin ? 'Check-in ok' : 'Sem check-in'}
          </span>
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
            {!checkin && (
              <ButtonLink to="/checkin" variant="secondary" fullWidth>
                Fazer check-in
              </ButtonLink>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 border-t border-neutral-800 pt-3 text-center">
          <div>
            <p className="text-lg font-bold">{recentWods.length}</p>
            <p className="text-xs text-neutral-500">WODs</p>
          </div>
          <div>
            <p className="text-lg font-bold">{records.length}</p>
            <p className="text-xs text-neutral-500">PRs</p>
          </div>
          <div>
            <p className="text-lg font-bold">{lastFourWeeksTotal}</p>
            <p className="text-xs text-neutral-500">4 semanas</p>
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

      {latestRecords.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-300">PRs recentes</p>
            <Link to="/personal-records" className="text-sm text-orange-500">
              Ver todos
            </Link>
          </div>
          <ul className="space-y-2">
            {latestRecords.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-neutral-300">{record.movementName}</span>
                <span className="shrink-0 font-semibold">
                  {record.value} {record.unit}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {frequency.length > 0 && <TrainingFrequencyChart weeks={frequency} />}
    </PageShell>
  );
}
