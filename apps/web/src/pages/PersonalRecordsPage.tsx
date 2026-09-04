import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { COMMON_LIFTS, COMMON_GYMNASTICS, COMMON_BENCHMARK_WODS } from "@wod-coach-ai/types";
import { api, ApiError, type PersonalRecord } from "../lib/api.js";
import { NavBar } from "../components/NavBar.js";

const SUGGESTED_MOVEMENTS = [...COMMON_LIFTS, ...COMMON_GYMNASTICS, ...COMMON_BENCHMARK_WODS];

const PERCENTAGE_STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const WEIGHT_UNITS = new Set(["kg", "lb"]);

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function PersonalRecordsPage() {
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [movementName, setMovementName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("kg");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    api
      .listPersonalRecords()
      .then(({ records }) => setRecords(records))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erro ao carregar."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.createPersonalRecord({
        movementName,
        value: Number(value),
        unit,
        notes: notes || undefined,
      });
      setMovementName("");
      setValue("");
      setNotes("");
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar o PR.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deletePersonalRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Meus PRs</h1>
          <Link to="/" className="text-sm text-neutral-400">
            Início
          </Link>
        </div>

        <NavBar />

        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-800 p-4">
          {formError && <p className="text-red-400 text-sm">{formError}</p>}
          <input
            list="movement-suggestions"
            type="text"
            required
            placeholder="Movimento (ex: Back Squat, Fran)"
            value={movementName}
            onChange={(e) => setMovementName(e.target.value)}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />
          <datalist id="movement-suggestions">
            {SUGGESTED_MOVEMENTS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              required
              placeholder="Valor"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
              <option value="sec">segundos</option>
              <option value="reps">reps</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Adicionar PR"}
          </button>
        </form>

        {loading && <p className="text-neutral-400">Carregando...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <ul className="space-y-2">
          {records.map((record) => {
            const isWeight = WEIGHT_UNITS.has(record.unit);
            const isExpanded = expandedId === record.id;
            return (
              <li
                key={record.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{record.movementName}</p>
                    <p className="text-sm text-neutral-400">
                      {record.value} {record.unit}
                      {record.notes ? ` · ${record.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isWeight && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        className="text-xs text-orange-400"
                      >
                        {isExpanded ? "Ocultar %" : "Ver %"}
                      </button>
                    )}
                    <button
                      onClick={() => void handleDelete(record.id)}
                      className="text-xs text-neutral-500"
                    >
                      Remover
                    </button>
                  </div>
                </div>

                {isWeight && isExpanded && (
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-800 pt-3">
                    {PERCENTAGE_STEPS.map((pct) => (
                      <div
                        key={pct}
                        className="rounded-md bg-neutral-950 px-2 py-1.5 text-center"
                      >
                        <p className="text-xs text-neutral-500">{pct}%</p>
                        <p className="text-sm font-semibold">
                          {roundToHalf((record.value * pct) / 100)} {record.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
