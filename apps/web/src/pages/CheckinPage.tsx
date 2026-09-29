import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { NavBar } from '../components/NavBar.js';
import { PageHeader } from '../components/PageHeader.js';
import {
  Alert,
  Button,
  Field,
  LoadingState,
  PageShell,
  TextArea,
  TextInput,
} from '../components/ui.js';

function secondsToMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function mmSsToSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(':');
  if (parts.length === 1) {
    const seconds = Number(parts[0]);
    return Number.isFinite(seconds) ? Math.round(seconds) : undefined;
  }
  const [minutesStr, secondsStr] = parts;
  const minutes = Number(minutesStr);
  const seconds = Number(secondsStr);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return undefined;
  return Math.round(minutes * 60 + seconds);
}

export function CheckinPage() {
  const navigate = useNavigate();
  const [timeInput, setTimeInput] = useState('');
  const [rounds, setRounds] = useState('');
  const [reps, setReps] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTodayCheckin()
      .then(({ checkin }) => {
        setTimeInput(checkin.timeSeconds != null ? secondsToMmSs(checkin.timeSeconds) : '');
        setRounds(checkin.rounds != null ? String(checkin.rounds) : '');
        setReps(checkin.reps != null ? String(checkin.reps) : '');
        setWeightKg(checkin.weightKg != null ? String(checkin.weightKg) : '');
        setNotes(checkin.notes ?? '');
      })
      .catch(() => {
        // Ainda não há check-in hoje — formulário fica com os valores padrão.
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.saveCheckin({
        timeSeconds: mmSsToSeconds(timeInput),
        rounds: rounds ? Number(rounds) : undefined,
        reps: reps ? Number(reps) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        notes: notes || undefined,
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o check-in.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Resultado do treino</h1>
          <div className="flex gap-3">
            <BrandHomeLink />
            <button type="button" onClick={() => navigate(-1)} className="text-sm text-neutral-400">
              Voltar
            </button>
          </div>
        </div>
      </PageHeader>

      <NavBar />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert>{error}</Alert>}

        <Field label="Tempo total (mm:ss) — opcional">
          <TextInput
            type="text"
            placeholder="ex: 12:34"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Rounds — opcional</label>
            <TextInput
              type="number"
              min={0}
              placeholder="0"
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Reps — opcional</label>
            <TextInput
              type="number"
              min={0}
              placeholder="0"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </div>
        </div>

        <TextInput
          type="number"
          step="0.1"
          placeholder="Peso hoje (kg) — opcional"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
        <TextArea
          placeholder="Observações — opcional"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />

        <Button type="submit" disabled={saving} fullWidth>
          {saving ? 'Salvando...' : 'Salvar check-in'}
        </Button>
      </form>
    </PageShell>
  );
}
