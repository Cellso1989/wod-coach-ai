import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { api, ApiError, type WodAnalysis } from '../lib/api.js';
import { Alert, Button, TextInput } from './ui.js';

export function WodLoadEditor({
  wodId,
  analysis,
  disabled,
  onEditingChange,
  onSavingChange,
  onSaved,
}: {
  wodId: string;
  analysis: WodAnalysis;
  disabled: boolean;
  onEditingChange: (editing: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: (analysis: WodAnalysis) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setEditing(false);
    onEditingChange(false);
  }

  async function save() {
    if (disabled || saving) return;
    const movementLoads = analysis.movements
      .map((item) => ({
        id: item.id,
        loadDescription: values[item.id]?.trim() || null,
      }))
      .filter(
        (item) =>
          item.loadDescription !==
          (analysis.movements
            .find((movement) => movement.id === item.id)
            ?.loadDescription?.trim() || null),
      );
    if (!movementLoads.length) {
      close();
      return;
    }
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      const { analysis: updated } = await api.updateWodAnalysis(wodId, {
        versionId: analysis.versionId ?? undefined,
        movementLoads,
      });
      close();
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel salvar as cargas.');
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  if (!editing)
    return (
      <Button
        variant="secondary"
        className="gap-2"
        disabled={disabled}
        onClick={() => {
          setValues(
            Object.fromEntries(
              analysis.movements.map((item) => [item.id, item.loadDescription ?? '']),
            ),
          );
          setError(null);
          setEditing(true);
          onEditingChange(true);
        }}
      >
        <Dumbbell size={16} aria-hidden="true" />
        Editar cargas
      </Button>
    );

  return (
    <form
      aria-label="Cargas do treino"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error && <Alert>{error}</Alert>}
      {analysis.movements.map((movement) => (
        <label key={movement.id} className="block space-y-1 text-sm text-neutral-300">
          <span>{movement.name}</span>
          <TextInput
            value={values[movement.id] ?? ''}
            maxLength={120}
            placeholder="Ex.: 60/40 kg, 2 x 15 kg, 75% do 1RM"
            disabled={saving}
            onChange={(event) =>
              setValues((current) => ({ ...current, [movement.id]: event.target.value }))
            }
          />
        </label>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={saving}
          onClick={close}
        >
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={disabled || saving}>
          {saving ? 'Salvando...' : 'Salvar cargas'}
        </Button>
      </div>
    </form>
  );
}
