import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  COMMON_BENCHMARK_WODS,
  COMMON_GYMNASTICS,
  COMMON_LIFTS,
  type PersonalRecordType,
} from '@wod-coach-ai/types';
import { api, ApiError, type PersonalRecord } from '../lib/api.js';
import { NavBar } from '../components/NavBar.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { PageHeader } from '../components/PageHeader.js';
import { PrHistoryChart } from '../components/PrHistoryChart.js';
import { MovementAutocomplete } from '../components/MovementAutocomplete.js';
import { Alert, Button, EmptyState, PageShell, SelectInput, TextInput } from '../components/ui.js';

function interleave(...lists: readonly (readonly string[])[]): string[] {
  const result: string[] = [];
  const maxLength = Math.max(...lists.map((list) => list.length));
  for (let i = 0; i < maxLength; i++) {
    for (const list of lists) {
      if (i < list.length) result.push(list[i]!);
    }
  }
  return result;
}

const SUGGESTED_MOVEMENTS = interleave(COMMON_LIFTS, COMMON_GYMNASTICS, COMMON_BENCHMARK_WODS);
const PERCENTAGE_STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const WEIGHT_UNITS = new Set(['kg', 'kgs', 'lb', 'lbs']);
const RECORD_LABELS: Record<PersonalRecordType, string> = {
  UNKNOWN: 'Tipo nao informado',
  ONE_RM: '1RM',
  REP_MAX: 'Carga para repeticoes',
  UNBROKEN_REPS: 'Repeticoes sem quebra',
  TIME: 'Tempo',
};
function recordLabel(record: PersonalRecord) {
  return record.recordType === 'REP_MAX'
    ? `${record.repetitions}RM`
    : RECORD_LABELS[record.recordType ?? 'UNKNOWN'];
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function PersonalRecordsPage() {
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [movementName, setMovementName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('kg');
  const [notes, setNotes] = useState('');
  const [recordType, setRecordType] = useState<PersonalRecordType>('UNKNOWN');
  const [repetitions, setRepetitions] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMovements, setExpandedMovements] = useState<Set<string>>(new Set());

  const historyByMovement = useMemo(() => {
    const groups = new Map<string, PersonalRecord[]>();
    for (const record of records) {
      const key = JSON.stringify([
        record.movementName,
        record.recordType ?? 'UNKNOWN',
        record.repetitions ?? null,
        record.unit,
      ]);
      const group = groups.get(key) ?? [];
      group.push(record);
      groups.set(key, group);
    }
    return Array.from(groups.entries())
      .map(([key, recs]) => {
        const sorted = [...recs].sort(
          (a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime(),
        );
        const latest = sorted[sorted.length - 1]!;
        return {
          key,
          name: `${latest.movementName} - ${recordLabel(latest)}`,
          unit: latest.unit,
          history: sorted,
        };
      })
      .filter((group) => group.history.length > 1);
  }, [records]);

  function load() {
    api
      .listPersonalRecords()
      .then(({ records }) => setRecords(records))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function resetForm() {
    setEditingId(null);
    setMovementName('');
    setValue('');
    setUnit('kg');
    setNotes('');
    setRecordType('UNKNOWN');
    setRepetitions('');
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const input = {
        movementName,
        value: Number(value),
        unit,
        recordType,
        repetitions: recordType === 'REP_MAX' ? Number(repetitions) : null,
        notes: notes || undefined,
      };

      if (editingId) {
        const { record } = await api.updatePersonalRecord(editingId, input);
        setRecords((prev) => prev.map((item) => (item.id === record.id ? record : item)));
      } else {
        const { record } = await api.createPersonalRecord(input);
        setRecords((prev) => [record, ...prev]);
      }

      resetForm();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Nao foi possivel salvar o PR.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(record: PersonalRecord) {
    setEditingId(record.id);
    setMovementName(record.movementName);
    setValue(String(record.value));
    setUnit(record.unit);
    setNotes(record.notes ?? '');
    setRecordType(record.recordType ?? 'UNKNOWN');
    setRepetitions(record.repetitions == null ? '' : String(record.repetitions));
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(record: PersonalRecord) {
    const label = `${record.movementName} - ${record.value} ${record.unit}`;
    if (!window.confirm(`Remover o PR "${label}"? Essa acao nao pode ser desfeita.`)) return;

    try {
      await api.deletePersonalRecord(record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      if (editingId === record.id) resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel remover o PR.');
    }
  }

  function toggleMovement(name: string) {
    setExpandedMovements((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Meus PRs</h1>
          <BrandHomeLink />
        </div>
      </PageHeader>

      <NavBar />

      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-300">
            {editingId ? 'Editar PR' : 'Adicionar PR'}
          </h2>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-8 px-2 py-1 text-xs"
              onClick={resetForm}
            >
              Cancelar
            </Button>
          )}
        </div>

        {formError && <Alert>{formError}</Alert>}
        <MovementAutocomplete
          value={movementName}
          onChange={setMovementName}
          suggestions={SUGGESTED_MOVEMENTS}
          placeholder="Movimento (ex: Back Squat, Fran)"
        />

        <div className="grid grid-cols-2 gap-2">
          <TextInput
            type="number"
            step="0.01"
            required
            placeholder="Valor"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <SelectInput
            aria-label="Unidade"
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value);
              setRecordType('UNKNOWN');
              setRepetitions('');
            }}
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
            <option value="sec">segundos</option>
            <option value="reps">reps</option>
            {!['kg', 'lb', 'sec', 'reps'].includes(unit) && <option value={unit}>{unit}</option>}
          </SelectInput>
        </div>

        <label className="block space-y-1 text-sm text-neutral-300">
          <span>Tipo de PR</span>
          <SelectInput
            aria-label="Tipo de PR"
            value={recordType}
            onChange={(event) => {
              setRecordType(event.target.value as PersonalRecordType);
              setRepetitions('');
            }}
          >
            <option value="UNKNOWN">Tipo nao informado</option>
            {WEIGHT_UNITS.has(unit.toLowerCase()) && (
              <option value="ONE_RM">1RM - uma repeticao maxima</option>
            )}
            {WEIGHT_UNITS.has(unit.toLowerCase()) && (
              <option value="REP_MAX">Carga para varias repeticoes</option>
            )}
            {unit === 'reps' && <option value="UNBROKEN_REPS">Repeticoes sem quebra</option>}
            {unit === 'sec' && <option value="TIME">Tempo de benchmark</option>}
          </SelectInput>
        </label>
        {recordType === 'REP_MAX' && (
          <label className="block space-y-1 text-sm text-neutral-300">
            <span>Repeticoes na carga registrada</span>
            <TextInput
              aria-label="Repeticoes na carga registrada"
              type="number"
              min="2"
              max="10000"
              step="1"
              required
              value={repetitions}
              onChange={(event) => setRepetitions(event.target.value)}
            />
          </label>
        )}

        <TextInput
          type="text"
          placeholder="Notas (opcional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <Button type="submit" disabled={saving} fullWidth>
          {saving ? 'Salvando...' : editingId ? 'Salvar alteracoes' : 'Adicionar PR'}
        </Button>
      </form>

      {loading && <p className="text-neutral-400">Carregando...</p>}
      {error && <Alert>{error}</Alert>}

      {!loading && records.length === 0 && (
        <EmptyState
          title="Nenhum PR registrado"
          description="Adicione seus principais PRs para melhorar as estrategias dos treinos."
        />
      )}

      {historyByMovement.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-300">Evolucao dos PRs</h2>
          {historyByMovement.map((group) => {
            const isOpen = expandedMovements.has(group.key);
            return (
              <div
                key={group.key}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <button
                  onClick={() => toggleMovement(group.key)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-xs text-orange-400">
                    {isOpen ? 'Ocultar' : 'Ver evolucao'}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-3 border-t border-neutral-800 pt-3">
                    <PrHistoryChart history={group.history} unit={group.unit} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ul className="space-y-2">
        {records.map((record) => {
          const isWeight =
            WEIGHT_UNITS.has(record.unit.toLowerCase()) && record.recordType === 'ONE_RM';
          const isExpanded = expandedId === record.id;
          return (
            <li
              key={record.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{record.movementName}</p>
                  <p className="text-sm text-neutral-400">
                    {recordLabel(record)}
                    {' - '}
                    {record.value} {record.unit}
                    {record.notes ? ` - ${record.notes}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isWeight && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : record.id)}
                      className="text-xs text-orange-400"
                    >
                      {isExpanded ? 'Ocultar %' : 'Ver %'}
                    </button>
                  )}
                  <Button
                    onClick={() => handleEdit(record)}
                    variant="secondary"
                    className="min-h-8 px-2 py-1 text-xs"
                  >
                    Editar
                  </Button>
                  <Button
                    onClick={() => void handleDelete(record)}
                    variant="danger"
                    className="min-h-8 px-2 py-1 text-xs"
                  >
                    Remover
                  </Button>
                </div>
              </div>

              {isWeight && isExpanded && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-800 pt-3">
                  {PERCENTAGE_STEPS.map((pct) => (
                    <div key={pct} className="rounded-md bg-neutral-950 px-2 py-1.5 text-center">
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
    </PageShell>
  );
}
