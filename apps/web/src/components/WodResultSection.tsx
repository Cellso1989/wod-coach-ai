import { useState, type FormEvent } from "react";
import { api, ApiError, type WodResult } from "../lib/api.js";

interface WodResultSectionProps {
  wodId: string;
  initialResult: WodResult | null;
}

export function WodResultSection({ wodId, initialResult }: WodResultSectionProps) {
  const [result, setResult] = useState<WodResult | null>(initialResult);

  const [score, setScore] = useState("");
  const [resultError, setResultError] = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  async function handleSaveResult(event: FormEvent) {
    event.preventDefault();
    setResultError(null);
    setSavingResult(true);
    try {
      const { result } = await api.saveWodResult(wodId, { score });
      setResult(result);
    } catch (err) {
      setResultError(
        err instanceof ApiError ? err.message : "Não foi possível salvar o resultado.",
      );
    } finally {
      setSavingResult(false);
    }
  }

  if (!result) {
    return (
      <form onSubmit={handleSaveResult} className="space-y-3 rounded-lg border border-neutral-800 p-4">
        <h2 className="text-sm font-semibold text-neutral-300">Registrar resultado</h2>
        {resultError && <p className="text-red-400 text-sm">{resultError}</p>}
        <input
          type="text"
          required
          placeholder='Resultado (ex: "8 rounds + 12 reps", "12:34")'
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
        />
        <button
          type="submit"
          disabled={savingResult}
          className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
        >
          {savingResult ? "Salvando..." : "Salvar resultado"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 p-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-300">Resultado</h2>
        <p className="text-lg font-bold">{result.score}</p>
      </div>
    </div>
  );
}
