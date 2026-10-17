import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type HyroxWorkout, type WodSourceType } from '../lib/api.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { NavBar } from '../components/NavBar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Button, ButtonLink, EmptyState, PageShell, TextInput } from '../components/ui.js';

const SOURCE_LABEL: Record<WodSourceType, string> = {
  TEXT: 'Texto',
  IMAGE: 'Imagem',
  TEXT_AND_IMAGE: 'Texto + imagem',
};

export function HyroxPage({ demo = false }: { demo?: boolean }) {
  const isDemo = import.meta.env.DEV && demo;
  const [workouts, setWorkouts] = useState<HyroxWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    api
      .listHyroxWorkouts(100)
      .then(({ workouts }) => setWorkouts(workouts))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, [isDemo]);

  const filteredWorkouts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return workouts;
    return workouts.filter((workout) =>
      [workout.name, workout.rawText, workout.notes, workout.result?.score]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [search, workouts]);

  async function handleDelete(id: string) {
    if (!window.confirm('Apagar este treino HYROX? Essa acao nao pode ser desfeita.')) return;
    try {
      await api.deleteHyroxWorkout(id);
      setWorkouts((prev) => prev.filter((workout) => workout.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel apagar o treino.');
    }
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">HYROX</h1>
          <BrandHomeLink />
        </div>
      </PageHeader>

      <NavBar />

      {isDemo && (
        <p className="rounded-lg border border-sky-900 bg-sky-950/30 px-3 py-2 text-xs text-sky-300">
          Prévia local · lista vazia de demonstração
        </p>
      )}

      <div className="flex justify-center">
        <Link
          to="/hyrox/new"
          className="flex min-h-[84px] w-full items-center gap-4 rounded-[20px] border-2 border-orange-300 bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-4 text-white transition duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-950 active:brightness-95"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl"
          >
            🏃
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-lg font-bold leading-6">Novo Treino</span>
            <span className="mt-1 block text-sm leading-5">Comece seu próximo desafio</span>
          </span>
        </Link>
      </div>

      <TextInput
        type="search"
        placeholder="Buscar treino HYROX"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading && <p className="text-neutral-400">Carregando...</p>}
      {error && <Alert>{error}</Alert>}

      {!loading && workouts.length === 0 && (
        <EmptyState
          title="Nenhum treino HYROX enviado ainda"
          description="Envie texto ou foto do treino do box para gerar analise e estrategia."
          action={
            <ButtonLink to="/hyrox/new" fullWidth>
              Enviar primeiro treino
            </ButtonLink>
          }
        />
      )}

      {!loading && workouts.length > 0 && filteredWorkouts.length === 0 && (
        <EmptyState title="Nada encontrado" description="Ajuste a busca para ver seus treinos." />
      )}

      <ul className="space-y-2">
        {filteredWorkouts.map((workout) => (
          <li
            key={workout.id}
            className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <Link to={`/hyrox/${workout.id}`} className="block min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{workout.name ?? 'Treino HYROX'}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {new Date(workout.date).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{SOURCE_LABEL[workout.sourceType]}</p>
              {workout.rawText && (
                <p className="mt-1 truncate text-sm text-neutral-400">{workout.rawText}</p>
              )}
            </Link>
            <Button
              onClick={() => void handleDelete(workout.id)}
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
