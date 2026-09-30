import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type AdminUsersResponse } from '../lib/api.js';
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

            <section className="space-y-3">
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
                            <span className="md:hidden text-neutral-500">WODs: </span>
                            {user.wodCount}
                          </p>
                          <p>
                            <span className="md:hidden text-neutral-500">Analises: </span>
                            {user.analysisCount}
                          </p>
                          <p>
                            <span className="md:hidden text-neutral-500">Estrategias: </span>
                            {user.strategyCount}
                          </p>
                          <p>
                            <span className="md:hidden text-neutral-500">Check-ins: </span>
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
