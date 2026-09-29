import { useState, type FormEvent } from 'react';
import { api, ApiError, type WodResult } from '../lib/api.js';
import { Alert, Button, Card, TextInput } from './ui.js';

interface WodResultSectionProps {
  wodId: string;
  initialResult: WodResult | null;
  onResultSaved?: (result: WodResult) => void;
}

export function WodResultSection({ wodId, initialResult, onResultSaved }: WodResultSectionProps) {
  const [result, setResult] = useState<WodResult | null>(initialResult);

  const [score, setScore] = useState('');
  const [resultError, setResultError] = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  async function handleSaveResult(event: FormEvent) {
    event.preventDefault();
    setResultError(null);
    setSavingResult(true);
    try {
      const { result } = await api.saveWodResult(wodId, { score });
      setResult(result);
      onResultSaved?.(result);
    } catch (err) {
      setResultError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar o resultado.',
      );
    } finally {
      setSavingResult(false);
    }
  }

  if (!result) {
    return (
      <form
        onSubmit={handleSaveResult}
        className="space-y-3 rounded-lg border border-neutral-800 p-4"
      >
        <h2 className="text-sm font-semibold text-neutral-300">Registrar resultado</h2>
        {resultError && <Alert>{resultError}</Alert>}
        <TextInput
          type="text"
          required
          placeholder='Resultado (ex: "8 rounds + 12 reps", "12:34")'
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <Button type="submit" disabled={savingResult} fullWidth>
          {savingResult ? 'Salvando...' : 'Salvar resultado'}
        </Button>
      </form>
    );
  }

  return (
    <Card className="space-y-4 bg-transparent">
      <div>
        <h2 className="text-sm font-semibold text-neutral-300">Resultado</h2>
        <p className="text-lg font-bold">{result.score}</p>
      </div>
    </Card>
  );
}
