import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type WodAnalysis, type WodResult } from '../lib/api.js';
import { getWodResultFeedback } from '../lib/wod-result-feedback.js';
import { Alert, Button, Card, TextInput } from './ui.js';

interface WodResultSectionProps {
  wodId: string;
  initialResult: WodResult | null;
  analysis?: Pick<WodAnalysis, 'format' | 'durationMinutes'> | null;
  onResultSaved?: (result: WodResult) => void;
}

export function WodResultSection({
  wodId,
  initialResult,
  analysis,
  onResultSaved,
}: WodResultSectionProps) {
  const [result, setResult] = useState<WodResult | null>(initialResult);
  const [editing, setEditing] = useState(false);

  const [score, setScore] = useState(initialResult?.score ?? '');
  const [resultError, setResultError] = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackDialog = useRef<HTMLDialogElement>(null);
  const feedbackTitleId = useId();
  const scoreHelpId = useId();

  useEffect(() => {
    if (feedback) feedbackDialog.current?.showModal();
  }, [feedback]);

  async function handleSaveResult(event: FormEvent) {
    event.preventDefault();
    setResultError(null);
    setSavingResult(true);
    try {
      const { result } = await api.saveWodResult(wodId, { score });
      setResult(result);
      setScore(result.score);
      setEditing(false);
      onResultSaved?.(result);
      setFeedback(getWodResultFeedback(result.score, analysis));
    } catch (err) {
      setResultError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar o resultado.',
      );
    } finally {
      setSavingResult(false);
    }
  }

  if (!result || editing) {
    return (
      <form
        onSubmit={handleSaveResult}
        className="space-y-3 rounded-lg border border-neutral-800 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-300">
            {result ? 'Editar resultado' : 'Registrar resultado'}
          </h2>
          {result && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-8 px-2 py-1 text-xs"
              onClick={() => {
                setScore(result.score);
                setResultError(null);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
        {resultError && <Alert>{resultError}</Alert>}
        <TextInput
          type="text"
          required
          placeholder='Resultado (ex: "8 rounds + 12 reps", "12:34", "CAP 10")'
          aria-describedby={scoreHelpId}
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <p id={scoreHelpId} className="text-xs text-neutral-500">
          Para WODs por tempo: CAP 10 = faltaram 10 repetições.
        </p>
        <Button type="submit" disabled={savingResult} fullWidth>
          {savingResult ? 'Salvando...' : result ? 'Atualizar resultado' : 'Salvar resultado'}
        </Button>
      </form>
    );
  }

  return (
    <>
      <Card className="space-y-4 bg-transparent">
        <div>
          <h2 className="text-sm font-semibold text-neutral-300">Resultado</h2>
          <p className="text-lg font-bold">{result.score}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => {
            setScore(result.score);
            setResultError(null);
            setEditing(true);
          }}
        >
          Editar resultado
        </Button>
      </Card>
      <dialog
        ref={feedbackDialog}
        aria-labelledby={feedbackTitleId}
        onClose={() => setFeedback(null)}
        className="!m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-orange-900/50 bg-neutral-950 p-6 text-center text-neutral-100 backdrop:bg-black/70"
      >
        <h2 id={feedbackTitleId} className="text-xl font-bold">
          {feedback}
        </h2>
        <Button
          type="button"
          fullWidth
          className="mt-5"
          onClick={() => feedbackDialog.current?.close()}
        >
          Fechar
        </Button>
      </dialog>
    </>
  );
}
