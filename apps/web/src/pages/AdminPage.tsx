import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type AdminActivityType, type AdminUsersResponse } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Button, Card, LoadingState } from '../components/ui.js';
import { NavBar } from '../components/NavBar.js';

const STATUS_LABEL = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  BLOCKED: 'Bloqueado',
};

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function changeAccess(id: string, status: 'APPROVED' | 'BLOCKED') {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.setUserAccess(id, status);
      setData(await api.getAdminUsers());
      setMessage(status === 'APPROVED' ? 'Acesso aprovado.' : 'Acesso bloqueado.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível atualizar o acesso.');
      // Refresh after conflicts so the next action uses the current state.
      await api
        .getAdminUsers()
        .then(setData)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  }

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
            <h1 className="mt-2 text-2xl font-bold">Usuários</h1>
            <p className="text-sm text-neutral-500">Usuarios e uso geral do app</p>
          </div>
        </PageHeader>

        <NavBar />

        {error && <Alert>{error}</Alert>}
        {message && (
          <p role="status" className="text-sm text-emerald-400">
            {message}
          </p>
        )}

        {data && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Usuarios" value={data.totals.users} />
              <StatCard label="WODs" value={data.totals.wods} />
              <StatCard label="Analises" value={data.totals.analyses} />
              <StatCard label="Estrategias" value={data.totals.strategies} />
              <StatCard label="Resultados" value={data.totals.results} />
            </section>

            <section className="grid gap-6">
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    Usuarios cadastrados
                  </h2>
                  <p className="text-sm text-orange-400">
                    {data.users.filter((user) => user.accessStatus === 'PENDING').length} aguardando
                    aprovação
                  </p>
                </div>

                {data.users.length === 0 ? (
                  <Card>
                    <p className="text-sm text-neutral-400">Nenhum usuario cadastrado ainda.</p>
                  </Card>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                    <div className="hidden grid-cols-[minmax(220px,1.4fr)_150px_repeat(4,88px)] gap-3 border-b border-neutral-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:grid">
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
                          className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(220px,1.4fr)_150px_repeat(4,88px)] lg:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-neutral-100">{user.name}</p>
                            <p className="truncate text-sm text-neutral-500">{user.email}</p>
                            <p className="mt-1 text-sm text-orange-400">
                              {user.isAdmin ? 'Administrador' : STATUS_LABEL[user.accessStatus]}
                            </p>
                            <p className="mt-1 text-xs text-neutral-600">
                              Cadastro: {formatDate(user.createdAt)}
                            </p>
                          </div>

                          <p className="text-sm text-neutral-300">
                            {formatDate(user.lastActivityAt)}
                          </p>

                          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:contents">
                            <p>
                              <span className="text-neutral-500 lg:hidden">WODs: </span>
                              {user.wodCount}
                            </p>
                            <p>
                              <span className="text-neutral-500 lg:hidden">Analises: </span>
                              {user.analysisCount}
                            </p>
                            <p>
                              <span className="text-neutral-500 lg:hidden">Estrategias: </span>
                              {user.strategyCount}
                            </p>
                            <p>
                              <span className="text-neutral-500 lg:hidden">Check-ins: </span>
                              {user.checkinCount}
                            </p>
                          </div>

                          <div className="text-xs text-neutral-500 lg:col-span-6">
                            Resultados: {user.resultCount} · PRs: {user.personalRecordCount}
                          </div>
                          {!user.isAdmin && (
                            <div className="flex flex-wrap gap-2 lg:col-span-6">
                              <Button
                                variant="secondary"
                                disabled={busy || user.accessStatus === 'APPROVED'}
                                aria-label={`Aprovar acesso de ${user.email}`}
                                onClick={() => void changeAccess(user.id, 'APPROVED')}
                              >
                                Aprovar acesso
                              </Button>
                              <Button
                                variant="secondary"
                                disabled={busy || user.accessStatus === 'BLOCKED'}
                                aria-label={`Bloquear acesso de ${user.email}`}
                                onClick={() => void changeAccess(user.id, 'BLOCKED')}
                              >
                                Bloquear acesso
                              </Button>
                            </div>
                          )}
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
            <section className="space-y-3" aria-labelledby="access-history-title">
              <h2
                id="access-history-title"
                className="text-sm font-semibold uppercase tracking-wide text-neutral-500"
              >
                Histórico de aprovações e bloqueios
              </h2>
              <p className="text-sm text-neutral-500">Últimas 50 alterações de acesso.</p>
              {data.accessHistory.length === 0 ? (
                <Card>Nenhuma alteração de acesso registrada.</Card>
              ) : (
                <ol className="space-y-2">
                  {data.accessHistory.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-neutral-800 p-3 text-sm break-words"
                    >
                      <p>
                        {entry.targetEmail}: {STATUS_LABEL[entry.fromStatus]} →{' '}
                        {STATUS_LABEL[entry.toStatus]}
                      </p>
                      <p className="text-neutral-500">
                        Por {entry.actorEmail} em {formatDate(entry.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
