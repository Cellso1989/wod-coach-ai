import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth-context.js';
import { NavBar } from '../components/NavBar.js';
import { LogoutButton } from '../components/LogoutButton.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import {
  Alert,
  Button,
  LoadingState,
  PageShell,
  SelectInput,
  TextInput,
} from '../components/ui.js';

interface ProfileFormState {
  birthDate: string;
  heightCm: string;
  weightKg: string;
  sex: string;
  level: string;
}

const EMPTY_FORM: ProfileFormState = {
  birthDate: '',
  heightCm: '',
  weightKg: '',
  sex: '',
  level: '',
};

export function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getAthleteProfile()
      .then(({ profile }) => {
        setForm({
          birthDate: (profile.birthDate as string)?.slice(0, 10) ?? '',
          heightCm: profile.heightCm != null ? String(profile.heightCm) : '',
          weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
          sex: (profile.sex as string) ?? '',
          level: (profile.level as string) ?? '',
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
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.');
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meu perfil</h1>
        <div className="flex items-center gap-3">
          <BrandHomeLink />
          <LogoutButton />
        </div>
      </div>

      <NavBar />

      <p className="text-neutral-400 text-sm">Logado como {user?.name}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {saved && <Alert variant="success">Perfil salvo.</Alert>}

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-neutral-300 mb-1">Dados físicos</legend>
          <TextInput
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            aria-label="Data de nascimento"
          />
          <div className="grid grid-cols-2 gap-2">
            <TextInput
              type="number"
              placeholder="Altura (cm)"
              value={form.heightCm}
              onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
            />
            <TextInput
              type="number"
              step="0.1"
              placeholder="Peso (kg)"
              value={form.weightKg}
              onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            />
          </div>
          <SelectInput value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
            <option value="">Sexo</option>
            <option value="MALE">Masculino</option>
            <option value="FEMALE">Feminino</option>
            <option value="OTHER">Outro</option>
          </SelectInput>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-neutral-300 mb-1">Experiência</legend>
          <SelectInput
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          >
            <option value="">Nível</option>
            <option value="SCALED">Scaled</option>
            <option value="INTERMEDIATE">Intermediário</option>
            <option value="RX">RX</option>
            <option value="ELITE">Elite</option>
          </SelectInput>
        </fieldset>

        <Button type="submit" fullWidth>
          Salvar perfil
        </Button>
      </form>
    </PageShell>
  );
}
