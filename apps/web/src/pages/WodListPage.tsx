import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Wod, type WodSourceType } from '../lib/api.js';
import { NavBar } from '../components/NavBar.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { PageHeader } from '../components/PageHeader.js';
import {
  Alert,
  Button,
  ButtonLink,
  EmptyState,
  PageShell,
  SelectInput,
  TextInput,
} from '../components/ui.js';

const SOURCE_LABEL: Record<WodSourceType, string> = {
  TEXT: 'Texto',
  IMAGE: 'Imagem',
  TEXT_AND_IMAGE: 'Texto + imagem',
};

export function WodListPage() {
  const [wods, setWods] = useState<Wod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | WodSourceType>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'WITH_RESULT' | 'WITHOUT_RESULT'>('ALL');

  useEffect(() => {
    api
      .listWods(100)
      .then(({ wods }) => setWods(wods))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredWods = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return wods.filter((wod) => {
      const hasResult = Boolean(wod.result);
      const matchesSearch =
        !normalizedSearch ||
        [wod.name, wod.rawText, wod.notes, wod.result?.score]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));
      const matchesSource = sourceFilter === 'ALL' || wod.sourceType === sourceFilter;
      const matchesResult =
        resultFilter === 'ALL' ||
        (resultFilter === 'WITH_RESULT' && hasResult) ||
        (resultFilter === 'WITHOUT_RESULT' && !hasResult);

      return matchesSearch && matchesSource && matchesResult;
    });
  }, [resultFilter, search, sourceFilter, wods]);

  async function handleDelete(id: string) {
    if (!window.confirm('Apagar este WOD? Essa acao nao pode ser desfeita.')) return;
    try {
      await api.deleteWod(id);
      setWods((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel apagar o WOD.');
    }
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Meus WODs</h1>
          <div className="flex items-center gap-3">
            <BrandHomeLink />
            <Link to="/wods/new" className="text-sm text-orange-500">
              + Novo
            </Link>
          </div>
        </div>
      </PageHeader>

      <NavBar />

      <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
        <TextInput
          type="search"
          placeholder="Buscar por nome, texto ou resultado"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectInput
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as 'ALL' | WodSourceType)}
          >
            <option value="ALL">Todas origens</option>
            <option value="TEXT">Texto</option>
            <option value="IMAGE">Imagem</option>
            <option value="TEXT_AND_IMAGE">Texto + imagem</option>
          </SelectInput>
          <SelectInput
            value={resultFilter}
            onChange={(event) =>
              setResultFilter(event.target.value as 'ALL' | 'WITH_RESULT' | 'WITHOUT_RESULT')
            }
          >
            <option value="ALL">Todos</option>
            <option value="WITH_RESULT">Com resultado</option>
            <option value="WITHOUT_RESULT">Sem resultado</option>
          </SelectInput>
        </div>
        <p className="text-xs text-neutral-500">
          {filteredWods.length} de {wods.length} WODs
        </p>
      </div>

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

      {!loading && wods.length > 0 && filteredWods.length === 0 && (
        <EmptyState title="Nada encontrado" description="Ajuste a busca ou remova filtros." />
      )}

      <ul className="space-y-2">
        {filteredWods.map((wod) => (
          <li
            key={wod.id}
            className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <Link to={`/wods/${wod.id}`} className="block min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{wod.name ?? 'WOD sem nome'}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {new Date(wod.date).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{SOURCE_LABEL[wod.sourceType]}</p>
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
