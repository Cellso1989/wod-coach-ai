import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type AdminActivityType, type AdminUsersResponse } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Card, LoadingState } from '../components/ui.js';

function formatDate(value: string | null): string {
  if (!value) return 'Sem atividade';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-2xl font-bold text-neutral-100">{value}</p>
    </Card>
  );
}

const ACTIVITY_STYLE: Record<AdminActivityType, string> = {
  WOD: 'border-orange-800/70 bg-orange-950/30 text-orange-200',
  ANALYSIS: 'border-sky-800/70 bg-sky-950/30 text-sky-200',
  STRATEGY: 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200',
  HYROX_STRATEGY: 'border-cyan-800/70 bg-cyan-950/30 text-cyan-200',
  RESULT: 'border-amber-800/70 bg-amber-950/30 text-amber-200',
  CHECKIN: 'border-violet-800/70 bg-violet-950/30 text-violet-200',
  PERSONAL_RECORD: 'border-rose-800/70 bg-rose-950/30 text-rose-200',
};

const ACTIVITY_LABEL: Record<AdminActivityType, string> = {
  WOD: 'WOD',
  ANALYSIS: 'Analise',
  STRATEGY: 'Estrategia',
  HYROX_STRATEGY: 'HYROX',
  RESULT: 'Resultado',
  CHECKIN: 'Check-in',
  PERSONAL_RECORD: 'PR',
};

export function AdminPage() {
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAdminUsers()
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setError('Seu usuario nao tem acesso ao painel administrativo.');
          return;
        }
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o painel.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingState message="Carregando painel admin..." />;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader>
          <div>
            <Link to="/" className="text-sm text-orange-500">
              Voltar
            </Link>
            <h1 className="mt-2 text-2xl font-bold">Admin</h1>
            <p className="text-sm text-neutral-500">Usuarios e uso geral do app</p>
          </div>
        </PageHeader>

        {error && <Alert>{error}</Alert>}

        {data && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Usuarios" value={data.totals.users} />
              <StatCard label="WODs" value={data.totals.wods} />
              <StatCard label="Analises" value={data.totals.analyses} />
              <StatCard label="Estrategias" value={data.totals.strategies} />
              <StatCard label="Resultados" value={data.totals.results} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    Usuarios cadastrados
                  </h2>
                </div>

                {data.users.length === 0 ? (
                  <Card>
                    <p className="text-sm text-neutral-400">Nenhum usuario cadastrado ainda.</p>
                  </Card>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                    <div className="hidden grid-cols-[minmax(220px,1.4fr)_150px_repeat(4,88px)] gap-3 border-b border-neutral-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 md:grid">
                      <span>Usuario</span>
                      <span>Ultima atividade</span>
                      <span>WODs</span>
                      <span>Analises</span>
                      <span>Estrategias</span>
                      <span>Check-ins</span>
                    </div>

                    <ul className="divide-y divide-neutral-800">
                      {data.users.map((user) => (
                        <li
                          key={user.id}
                          className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(220px,1.4fr)_150px_repeat(4,88px)] md:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-neutral-100">{user.name}</p>
                            <p className="truncate text-sm text-neutral-500">{user.email}</p>
                            <p className="mt-1 text-xs text-neutral-600">
                              Cadastro: {formatDate(user.createdAt)}
                            </p>
                          </div>

                          <p className="text-sm text-neutral-300">
                            {formatDate(user.lastActivityAt)}
                          </p>

                          <div className="grid grid-cols-4 gap-2 text-sm md:contents">
                            <p>
                              <span className="text-neutral-500 md:hidden">WODs: </span>
                              {user.wodCount}
                            </p>
                            <p>
                              <span className="text-neutral-500 md:hidden">Analises: </span>
                              {user.analysisCount}
                            </p>
                            <p>
                              <span className="text-neutral-500 md:hidden">Estrategias: </span>
                              {user.strategyCount}
                            </p>
                            <p>
                              <span className="text-neutral-500 md:hidden">Check-ins: </span>
                              {user.checkinCount}
                            </p>
                          </div>

                          <div className="text-xs text-neutral-500 md:col-span-6">
                            Resultados: {user.resultCount} · PRs: {user.personalRecordCount}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <aside className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    Atividades recentes
                  </h2>
                </div>

                {data.activities.length === 0 ? (
                  <Card>
                    <p className="text-sm text-neutral-400">Nenhuma atividade registrada ainda.</p>
                  </Card>
                ) : (
                  <ol className="space-y-3">
                    {data.activities.map((activity) => (
                      <li
                        key={activity.id}
                        className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-100">
                              {activity.userName}
                            </p>
                            <p className="truncate text-xs text-neutral-500">
                              {activity.userEmail}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${ACTIVITY_STYLE[activity.type]}`}
                          >
                            {ACTIVITY_LABEL[activity.type]}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-medium text-neutral-200">
                          {activity.title}
                        </p>
                        {activity.detail && (
                          <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                            {activity.detail}
                          </p>
                        )}
                        <p className="mt-3 text-xs text-neutral-600">
                          {formatDate(activity.occurredAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
