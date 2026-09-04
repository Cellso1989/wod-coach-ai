import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type DailyCheckin } from "../lib/api.js";
import { BrandHomeLink } from "../components/BrandHomeLink.js";

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helpLow: string;
  helpHigh: string;
}

function SliderField({ label, value, onChange, helpLow, helpHigh }: SliderFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-neutral-300">{label}</label>
        <span className="text-lg font-bold text-orange-500">{value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-orange-600"
      />
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{helpLow}</span>
        <span>{helpHigh}</span>
      </div>
    </div>
  );
}

const READINESS_LABEL: Record<DailyCheckin["readinessBand"], string> = {
  high: "Alta",
  moderate: "Moderada",
  low: "Baixa",
};

const READINESS_COLOR: Record<DailyCheckin["readinessBand"], string> = {
  high: "text-green-400",
  moderate: "text-yellow-400",
  low: "text-red-400",
};

export function CheckinPage() {
  const [sleep, setSleep] = useState(7);
  const [energy, setEnergy] = useState(7);
  const [stress, setStress] = useState(4);
  const [bodyPain, setBodyPain] = useState(3);
  const [motivation, setMotivation] = useState(7);
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DailyCheckin | null>(null);

  useEffect(() => {
    api
      .getTodayCheckin()
      .then(({ checkin }) => {
        setResult(checkin);
        setSleep(checkin.sleep);
        setEnergy(checkin.energy);
        setStress(checkin.stress);
        setBodyPain(Math.round((checkin.muscleSoreness + checkin.jointPain) / 2));
        setMotivation(checkin.motivation);
        setWeightKg(checkin.weightKg != null ? String(checkin.weightKg) : "");
        setNotes(checkin.notes ?? "");
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
      const { checkin } = await api.saveCheckin({
        sleep,
        energy,
        stress,
        muscleSoreness: bodyPain,
        jointPain: bodyPain,
        motivation,
        weightKg: weightKg ? Number(weightKg) : undefined,
        notes: notes || undefined,
      });
      setResult(checkin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o check-in.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Check-in de hoje</h1>
          <div className="flex gap-3">
            <BrandHomeLink />
            <Link to="/wods" className="text-sm text-neutral-400">
              Meus WODs
            </Link>
            <Link to="/personal-records" className="text-sm text-neutral-400">
              PRs
            </Link>
            <Link to="/profile" className="text-sm text-neutral-400">
              Meu perfil
            </Link>
          </div>
        </div>

        <Link
          to="/wods/new"
          className="block rounded-lg bg-orange-600 py-3 text-center font-semibold"
        >
          Enviar WOD de hoje
        </Link>

        {result && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-sm text-neutral-400">Nível de Prontidão</p>
            <p className="text-4xl font-bold">{result.readinessScore}</p>
            <p className={`text-sm font-semibold ${READINESS_COLOR[result.readinessBand]}`}>
              {READINESS_LABEL[result.readinessBand]}
            </p>
            {result.cautionFlags.length > 0 && (
              <ul className="mt-3 space-y-1 text-left text-xs text-yellow-300">
                {result.cautionFlags.map((flag) => (
                  <li key={flag}>⚠ {flag}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <SliderField
            label="Sono"
            value={sleep}
            onChange={setSleep}
            helpLow="Péssimo"
            helpHigh="Ótimo"
          />
          <SliderField
            label="Energia"
            value={energy}
            onChange={setEnergy}
            helpLow="Sem energia"
            helpHigh="Cheio de energia"
          />
          <SliderField
            label="Estresse"
            value={stress}
            onChange={setStress}
            helpLow="Tranquilo"
            helpHigh="Muito estressado"
          />
          <SliderField
            label="Dor no corpo"
            value={bodyPain}
            onChange={setBodyPain}
            helpLow="Sem dor"
            helpHigh="Dor extrema"
          />
          <SliderField
            label="Motivação"
            value={motivation}
            onChange={setMotivation}
            helpLow="Sem vontade"
            helpHigh="Muito motivado"
          />

          <input
            type="number"
            step="0.1"
            placeholder="Peso hoje (kg) — opcional"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />
          <textarea
            placeholder="Observações — opcional (ex: se a dor for numa articulação específica, pode contar aqui)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-orange-600 py-3 font-semibold transition-colors duration-150 hover:bg-orange-700 active:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar check-in"}
          </button>
        </form>
      </div>
    </main>
  );
}
