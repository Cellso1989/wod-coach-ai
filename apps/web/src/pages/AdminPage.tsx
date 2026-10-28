import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type AdminUsersResponse } from '../lib/api.js';
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
            <h1 className="mt-2 text-2xl font-bold">Administrador</h1>
            <p className="text-sm text-neutral-500">
              Gerencie a aprovação e o acesso ao aplicativo.
            </p>
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
                    <ul className="divide-y divide-neutral-800">
                      {data.users.map((user) => (
                        <li
                          key={user.id}
                          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
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

                          {!user.isAdmin && (
                            <div className="flex shrink-0 flex-wrap gap-2">
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
