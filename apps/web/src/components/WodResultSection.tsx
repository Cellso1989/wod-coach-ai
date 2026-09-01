import { useState, type FormEvent } from "react";
import { api, ApiError, type WodFeedback, type WodResult } from "../lib/api.js";

interface WodResultSectionProps {
  wodId: string;
  initialResult: WodResult | null;
}

const STRATEGY_OUTCOME_LABEL: Record<NonNullable<WodFeedback["strategyWorked"]>, string> = {
  YES: "Sim",
  PARTIALLY: "Parcialmente",
  NO: "Não",
};

export function WodResultSection({ wodId, initialResult }: WodResultSectionProps) {
  const [result, setResult] = useState<WodResult | null>(initialResult);

  const [score, setScore] = useState("");
  const [rpe, setRpe] = useState(7);
  const [resultError, setResultError] = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  const [strategyWorked, setStrategyWorked] = useState<"YES" | "PARTIALLY" | "NO" | "">("");
  const [gripScore, setGripScore] = useState(5);
  const [legsScore, setLegsScore] = useState(5);
  const [breathingScore, setBreathingScore] = useState(5);
  const [overallDifficulty, setOverallDifficulty] = useState(7);
  const [whereItBroke, setWhereItBroke] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  async function handleSaveResult(event: FormEvent) {
    event.preventDefault();
    setResultError(null);
    setSavingResult(true);
    try {
      const { result } = await api.saveWodResult(wodId, { score, rpe });
      setResult(result);
    } catch (err) {
      setResultError(
        err instanceof ApiError ? err.message : "Não foi possível salvar o resultado.",
      );
    } finally {
      setSavingResult(false);
    }
  }

  async function handleSaveFeedback(event: FormEvent) {
    event.preventDefault();
    setFeedbackError(null);
    setSavingFeedback(true);
    try {
      const { feedback } = await api.saveWodFeedback(wodId, {
        strategyWorked: strategyWorked || undefined,
        gripScore,
        legsScore,
        breathingScore,
        overallDifficulty,
        whereItBroke: whereItBroke || undefined,
        notes: feedbackNotes || undefined,
      });
      setResult((prev) => (prev ? { ...prev, feedback } : prev));
    } catch (err) {
      setFeedbackError(
        err instanceof ApiError ? err.message : "Não foi possível salvar o feedback.",
      );
    } finally {
      setSavingFeedback(false);
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
        <div>
          <div className="flex justify-between text-xs text-neutral-400">
            <span>RPE</span>
            <span>{rpe}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value))}
            className="w-full accent-orange-600"
          />
        </div>
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
        <p className="text-sm text-neutral-500">RPE {result.rpe}/10</p>
      </div>

      {!result.feedback ? (
        <form onSubmit={handleSaveFeedback} className="space-y-3 border-t border-neutral-800 pt-4">
          <h3 className="text-sm font-semibold text-neutral-300">Como foi?</h3>
          {feedbackError && <p className="text-red-400 text-sm">{feedbackError}</p>}

          <select
            value={strategyWorked}
            onChange={(e) => setStrategyWorked(e.target.value as typeof strategyWorked)}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          >
            <option value="">A estratégia funcionou?</option>
            <option value="YES">Sim</option>
            <option value="PARTIALLY">Parcialmente</option>
            <option value="NO">Não</option>
          </select>

          {[
            { label: "Grip", value: gripScore, set: setGripScore },
            { label: "Pernas", value: legsScore, set: setLegsScore },
            { label: "Respiração", value: breathingScore, set: setBreathingScore },
            { label: "Dificuldade geral", value: overallDifficulty, set: setOverallDifficulty },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <div className="flex justify-between text-xs text-neutral-400">
                <span>{label}</span>
                <span>{value}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full accent-orange-600"
              />
            </div>
          ))}

          <input
            type="text"
            placeholder="Onde quebrou? (opcional)"
            value={whereItBroke}
            onChange={(e) => setWhereItBroke(e.target.value)}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />
          <textarea
            placeholder="Observações (opcional)"
            value={feedbackNotes}
            onChange={(e) => setFeedbackNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />

          <button
            type="submit"
            disabled={savingFeedback}
            className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
          >
            {savingFeedback ? "Salvando..." : "Salvar feedback"}
          </button>
        </form>
      ) : (
        <div className="space-y-1 border-t border-neutral-800 pt-4 text-sm text-neutral-400">
          {result.feedback.strategyWorked && (
            <p>Estratégia funcionou: {STRATEGY_OUTCOME_LABEL[result.feedback.strategyWorked]}</p>
          )}
          {result.feedback.whereItBroke && <p>Onde quebrou: {result.feedback.whereItBroke}</p>}
          {result.feedback.notes && <p>Notas: {result.feedback.notes}</p>}
          <p className="text-xs text-neutral-600">
            Esse feedback vai ajudar a calibrar a estratégia da próxima vez que você fizer um
            treino parecido.
          </p>
        </div>
      )}
    </div>
  );
}
