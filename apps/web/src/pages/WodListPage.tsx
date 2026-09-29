import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Wod } from '../lib/api.js';
import { NavBar } from '../components/NavBar.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { Alert, Button, ButtonLink, EmptyState, PageShell } from '../components/ui.js';

const SOURCE_LABEL: Record<Wod['sourceType'], string> = {
  TEXT: '📝',
  IMAGE: '📷',
  TEXT_AND_IMAGE: '📝📷',
};

export function WodListPage() {
  const [wods, setWods] = useState<Wod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWods()
      .then(({ wods }) => setWods(wods))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm('Apagar este WOD? Essa ação não pode ser desfeita.')) return;
    try {
      await api.deleteWod(id);
      setWods((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível apagar o WOD.');
    }
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meus WODs</h1>
        <div className="flex items-center gap-3">
          <BrandHomeLink />
          <Link to="/wods/new" className="text-sm text-orange-500">
            + Novo
          </Link>
        </div>
      </div>

      <NavBar />

      {loading && <p className="text-neutral-400">Carregando...</p>}
      {error && <Alert>{error}</Alert>}

      {!loading && wods.length === 0 && (
        <EmptyState
          title="Nenhum WOD enviado ainda"
          description="Comece enviando uma foto ou colando o texto do treino."
          action={
            <ButtonLink to="/wods/new" fullWidth>
              Enviar o primeiro WOD
            </ButtonLink>
          }
        />
      )}

      <ul className="space-y-2">
        {wods.map((wod) => (
          <li
            key={wod.id}
            className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <Link to={`/wods/${wod.id}`} className="block min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {SOURCE_LABEL[wod.sourceType]} {wod.name ?? 'WOD sem nome'}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {new Date(wod.date).toLocaleDateString('pt-BR')}
                </span>
              </div>
              {wod.rawText && (
                <p className="mt-1 truncate text-sm text-neutral-400">{wod.rawText}</p>
              )}
              {wod.result && <p className="mt-1 text-xs text-orange-400">{wod.result.score}</p>}
            </Link>
            <Button
              onClick={() => void handleDelete(wod.id)}
              variant="danger"
              className="min-h-9 shrink-0 px-3 py-1.5 text-xs"
            >
              Apagar
            </Button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
