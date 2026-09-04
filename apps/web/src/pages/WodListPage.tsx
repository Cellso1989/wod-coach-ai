import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Wod } from "../lib/api.js";
import { NavBar } from "../components/NavBar.js";

const SOURCE_LABEL: Record<Wod["sourceType"], string> = {
  TEXT: "📝",
  IMAGE: "📷",
  TEXT_AND_IMAGE: "📝📷",
};

export function WodListPage() {
  const [wods, setWods] = useState<Wod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWods()
      .then(({ wods }) => setWods(wods))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erro ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Apagar este WOD? Essa ação não pode ser desfeita.")) return;
    try {
      await api.deleteWod(id);
      setWods((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível apagar o WOD.");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Meus WODs</h1>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-neutral-400">
              Início
            </Link>
            <Link to="/wods/new" className="text-sm text-orange-500">
              + Novo
            </Link>
          </div>
        </div>

        <NavBar />

        {loading && <p className="text-neutral-400">Carregando...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && wods.length === 0 && (
          <p className="text-neutral-400 text-sm">
            Nenhum WOD enviado ainda.{" "}
            <Link to="/wods/new" className="text-orange-500">
              Enviar o primeiro
            </Link>
          </p>
        )}

        <ul className="space-y-2">
          {wods.map((wod) => (
            <li
              key={wod.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <Link to={`/wods/${wod.id}`} className="block">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {SOURCE_LABEL[wod.sourceType]} {wod.name ?? "WOD sem nome"}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {new Date(wod.date).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {wod.rawText && (
                  <p className="mt-1 truncate text-sm text-neutral-400">{wod.rawText}</p>
                )}
                {wod.result && (
                  <p className="mt-1 text-xs text-orange-400">
                    {wod.result.score} · RPE {wod.result.rpe}
                  </p>
                )}
              </Link>
              <button
                onClick={() => void handleDelete(wod.id)}
                className="mt-2 text-xs text-neutral-500"
              >
                Apagar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
