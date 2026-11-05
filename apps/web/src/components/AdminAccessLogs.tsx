import { useEffect, useRef, useState } from 'react';
import { api, type AdminUserSummary, type AccessLogsResponse } from '../lib/api.js';
import { Alert, Button, Card } from './ui.js';

const EVENT_LABEL = {
  LOGIN: 'Login',
  SESSION_RETURN: 'Retorno com sessão salva',
  CROSSFIT_ANALYSIS: 'Analisou treino CrossFit',
  HYROX_ANALYSIS: 'Analisou treino HYROX',
};

export function AdminAccessLogs({ users }: { users: AdminUserSummary[] }) {
  const [userId, setUserId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AccessLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setError(null);
    setLoading(true);
    void api
      .getAccessLogs(userId, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : 'Não foi possível carregar os acessos.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => pending.current?.abort();
  }, [userId, refresh]);

  async function loadMore() {
    if (loading || !data?.nextCursor) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAccessLogs(userId, data.nextCursor, controller.signal);
      if (!controller.signal.aborted)
        setData((previous) => ({
          logs: [...(previous?.logs ?? []), ...result.logs],
          nextCursor: result.nextCursor,
        }));
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os acessos.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="user-access-logs-title">
      <h2
        id="user-access-logs-title"
        className="text-sm font-semibold uppercase tracking-wide text-neutral-500"
      >
        Log de acessos
      </h2>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <label className="w-full min-w-0 flex-1 space-y-1 text-sm text-neutral-400">
          <span>Filtrar acessos por usuário</span>
          <select
            className="block w-full min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
            value={userId}
            onChange={(event) => {
              if (event.target.value === userId) return;
              pending.current?.abort();
              setData(null);
              setLoading(true);
              setError(null);
              setUserId(event.target.value);
            }}
          >
            <option value="">Todos os usuários</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Atualizar acessos
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && <p role="status">Carregando acessos...</p>}
      {data?.logs.length === 0 && <Card>Nenhum acesso registrado para este filtro.</Card>}
      {data && data.logs.length > 0 && (
        <ol className="space-y-2">
          {data.logs.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-neutral-800 p-3 text-sm break-words"
            >
              <p className="font-semibold">{entry.user.name}</p>
              <p className="text-neutral-400">{entry.user.email}</p>
              <p className="mt-1 text-neutral-300">
                {EVENT_LABEL[entry.kind]} ·{' '}
                {new Date(entry.createdAt).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </li>
          ))}
        </ol>
      )}
      {data?.nextCursor && (
        <Button variant="secondary" disabled={loading} onClick={() => void loadMore()}>
          Carregar acessos anteriores
        </Button>
      )}
    </section>
  );
}
