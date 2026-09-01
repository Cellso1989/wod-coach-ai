import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";

interface ProfileFormState {
  birthDate: string;
  heightCm: string;
  weightKg: string;
  sex: string;
  level: string;
  competitionCategory: string;
  weeklyFrequency: string;
  goals: string;
  injuries: string;
  limitedMovements: string;
  equipment: string;
}

const EMPTY_FORM: ProfileFormState = {
  birthDate: "",
  heightCm: "",
  weightKg: "",
  sex: "",
  level: "",
  competitionCategory: "",
  weeklyFrequency: "",
  goals: "",
  injuries: "",
  limitedMovements: "",
  equipment: "",
};

function toCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getAthleteProfile()
      .then(({ profile }) => {
        setForm({
          birthDate: (profile.birthDate as string)?.slice(0, 10) ?? "",
          heightCm: profile.heightCm != null ? String(profile.heightCm) : "",
          weightKg: profile.weightKg != null ? String(profile.weightKg) : "",
          sex: (profile.sex as string) ?? "",
          level: (profile.level as string) ?? "",
          competitionCategory: (profile.competitionCategory as string) ?? "",
          weeklyFrequency: profile.weeklyFrequency != null ? String(profile.weeklyFrequency) : "",
          goals: ((profile.goals as string[]) ?? []).join(", "),
          injuries: ((profile.injuries as string[]) ?? []).join(", "),
          limitedMovements: ((profile.limitedMovements as string[]) ?? []).join(", "),
          equipment: ((profile.equipment as string[]) ?? []).join(", "),
        });
      })
      .catch(() => {
        // Perfil ainda não criado — mantém o formulário vazio.
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await api.saveAthleteProfile({
        birthDate: form.birthDate || undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        sex: form.sex || undefined,
        level: form.level || undefined,
        competitionCategory: form.competitionCategory || undefined,
        weeklyFrequency: form.weeklyFrequency ? Number(form.weeklyFrequency) : undefined,
        goals: toCommaList(form.goals),
        injuries: toCommaList(form.injuries),
        limitedMovements: toCommaList(form.limitedMovements),
        equipment: toCommaList(form.equipment),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o perfil.");
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
          <h1 className="text-xl font-bold">Meu perfil</h1>
          <button onClick={() => void logout()} className="text-sm text-neutral-400">
            Sair
          </button>
        </div>

        <p className="text-neutral-400 text-sm">Logado como {user?.name}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {saved && <p className="text-green-400 text-sm">Perfil salvo.</p>}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-neutral-300 mb-1">Dados físicos</legend>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
              aria-label="Data de nascimento"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Altura (cm)"
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
              />
              <input
                type="number"
                step="0.1"
                placeholder="Peso (kg)"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
              />
            </div>
            <select
              value={form.sex}
              onChange={(e) => setForm({ ...form, sex: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            >
              <option value="">Sexo</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
              <option value="OTHER">Outro</option>
            </select>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-neutral-300 mb-1">Experiência</legend>
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            >
              <option value="">Nível</option>
              <option value="BEGINNER">Iniciante</option>
              <option value="INTERMEDIATE">Intermediário</option>
              <option value="ADVANCED">Avançado</option>
              <option value="COMPETITOR">Competidor</option>
            </select>
            <input
              type="text"
              placeholder="Categoria de competição"
              value={form.competitionCategory}
              onChange={(e) => setForm({ ...form, competitionCategory: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
            <input
              type="number"
              placeholder="Frequência semanal"
              value={form.weeklyFrequency}
              onChange={(e) => setForm({ ...form, weeklyFrequency: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-neutral-300 mb-1">
              Objetivos, limitações e equipamentos
            </legend>
            <input
              type="text"
              placeholder="Objetivos (separados por vírgula)"
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
            <input
              type="text"
              placeholder="Lesões (separadas por vírgula)"
              value={form.injuries}
              onChange={(e) => setForm({ ...form, injuries: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
            <input
              type="text"
              placeholder="Movimentos limitados (separados por vírgula)"
              value={form.limitedMovements}
              onChange={(e) => setForm({ ...form, limitedMovements: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
            <input
              type="text"
              placeholder="Equipamentos (separados por vírgula)"
              value={form.equipment}
              onChange={(e) => setForm({ ...form, equipment: e.target.value })}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
            />
          </fieldset>

          <button type="submit" className="w-full rounded-lg bg-orange-600 py-3 font-semibold">
            Salvar perfil
          </button>
        </form>
      </div>
    </main>
  );
}
