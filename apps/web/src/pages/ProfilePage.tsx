import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth-context.js';
import { NavBar } from '../components/NavBar.js';
import { LogoutButton } from '../components/LogoutButton.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { PageHeader } from '../components/PageHeader.js';
import {
  Alert,
  Button,
  Field,
  LoadingState,
  PageShell,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui.js';

interface ProfileFormState {
  birthDate: string;
  heightCm: string;
  weightKg: string;
  sex: string;
  level: string;
  crossfitSince: string;
  competitionCategory: string;
  weeklyFrequency: string;
  goals: string;
  injuries: string;
  limitedMovements: string;
  equipment: string;
}

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_FORM: ProfileFormState = {
  birthDate: '',
  heightCm: '',
  weightKg: '',
  sex: '',
  level: '',
  crossfitSince: '',
  competitionCategory: '',
  weeklyFrequency: '',
  goals: '',
  injuries: '',
  limitedMovements: '',
  equipment: '',
};

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function listToText(value: unknown): string {
  return Array.isArray(value) ? value.join('\n') : '';
}

function textToList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateField(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

export function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    api
      .getAthleteProfile()
      .then(({ profile }) => {
        setForm({
          birthDate: dateField(profile.birthDate),
          heightCm: profile.heightCm != null ? String(profile.heightCm) : '',
          weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
          sex: (profile.sex as string) ?? '',
          level: (profile.level as string) ?? '',
          crossfitSince: dateField(profile.crossfitSince),
          competitionCategory: (profile.competitionCategory as string) ?? '',
          weeklyFrequency: profile.weeklyFrequency != null ? String(profile.weeklyFrequency) : '',
          goals: listToText(profile.goals),
          injuries: listToText(profile.injuries),
          limitedMovements: listToText(profile.limitedMovements),
          equipment: listToText(profile.equipment),
        });
      })
      .catch(() => {
        // Perfil ainda não criado: mantém o formulário vazio.
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSavingProfile(true);
    try {
      await api.saveAthleteProfile({
        birthDate: form.birthDate || undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        sex: form.sex || undefined,
        level: form.level || undefined,
        crossfitSince: form.crossfitSince || undefined,
        competitionCategory: form.competitionCategory.trim() || undefined,
        weeklyFrequency: form.weeklyFrequency ? Number(form.weeklyFrequency) : undefined,
        goals: textToList(form.goals),
        injuries: textToList(form.injuries),
        limitedMovements: textToList(form.limitedMovements),
        equipment: textToList(form.equipment),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('A confirmação precisa ser igual à nova senha.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Meu perfil</h1>
          <div className="flex items-center gap-3">
            <BrandHomeLink />
            <LogoutButton />
          </div>
        </div>
      </PageHeader>

      <NavBar />

      <p className="text-sm text-neutral-400">Logado como {user?.name}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        {saved && <Alert variant="success">Perfil salvo.</Alert>}

        <fieldset className="space-y-2 rounded-lg border border-neutral-800 p-4">
          <legend className="px-1 text-sm font-semibold text-neutral-300">Dados físicos</legend>
          <Field label="Data de nascimento">
            <TextInput
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Altura">
              <TextInput
                type="number"
                placeholder="cm"
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
              />
            </Field>
            <Field label="Peso">
              <TextInput
                type="number"
                step="0.1"
                placeholder="kg"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Sexo">
            <SelectInput
              value={form.sex}
              onChange={(e) => setForm({ ...form, sex: e.target.value })}
            >
              <option value="">Não informar</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
              <option value="OTHER">Outro</option>
            </SelectInput>
          </Field>
        </fieldset>

        <fieldset className="space-y-2 rounded-lg border border-neutral-800 p-4">
          <legend className="px-1 text-sm font-semibold text-neutral-300">
            Experiência e contexto
          </legend>
          <Field label="Nível">
            <SelectInput
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
            >
              <option value="">Não informar</option>
              <option value="SCALED">Scaled</option>
              <option value="INTERMEDIATE">Intermediário</option>
              <option value="RX">RX</option>
              <option value="ELITE">Elite</option>
            </SelectInput>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="CrossFit desde">
              <TextInput
                type="date"
                value={form.crossfitSince}
                onChange={(e) => setForm({ ...form, crossfitSince: e.target.value })}
              />
            </Field>
            <Field label="Treinos/semana">
              <TextInput
                type="number"
                min={0}
                max={14}
                placeholder="ex: 5"
                value={form.weeklyFrequency}
                onChange={(e) => setForm({ ...form, weeklyFrequency: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Categoria">
            <TextInput
              placeholder="ex: RX, Scaled, Master 35+"
              value={form.competitionCategory}
              onChange={(e) => setForm({ ...form, competitionCategory: e.target.value })}
            />
          </Field>
          <Field label="Objetivos" hint="Um por linha ou separados por vírgula.">
            <TextArea
              rows={3}
              placeholder="ex: melhorar ginásticos, competir RX"
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
            />
          </Field>
          <Field label="Lesões ou cuidados" hint="Ajuda a IA a ajustar a estratégia com segurança.">
            <TextArea
              rows={3}
              placeholder="ex: ombro direito, lombar"
              value={form.injuries}
              onChange={(e) => setForm({ ...form, injuries: e.target.value })}
            />
          </Field>
          <Field label="Movimentos limitados">
            <TextArea
              rows={3}
              placeholder="ex: HSPU, ring muscle-up"
              value={form.limitedMovements}
              onChange={(e) => setForm({ ...form, limitedMovements: e.target.value })}
            />
          </Field>
          <Field label="Equipamentos disponíveis">
            <TextArea
              rows={3}
              placeholder="ex: barra, anilhas, bike, remo"
              value={form.equipment}
              onChange={(e) => setForm({ ...form, equipment: e.target.value })}
            />
          </Field>
        </fieldset>

        <Button type="submit" disabled={savingProfile} fullWidth>
          {savingProfile ? 'Salvando...' : 'Salvar perfil'}
        </Button>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="space-y-3 rounded-lg border border-neutral-800 p-4"
      >
        <div>
          <h2 className="text-sm font-semibold text-neutral-300">Trocar senha</h2>
          <p className="mt-1 text-xs text-neutral-600">
            Use uma senha com pelo menos 8 caracteres.
          </p>
        </div>

        {passwordError && <Alert>{passwordError}</Alert>}
        {passwordSaved && <Alert variant="success">Senha atualizada.</Alert>}

        <TextInput
          type="password"
          required
          placeholder="Senha atual"
          value={passwordForm.currentPassword}
          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
        />
        <TextInput
          type="password"
          required
          minLength={8}
          placeholder="Nova senha"
          value={passwordForm.newPassword}
          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
        />
        <TextInput
          type="password"
          required
          minLength={8}
          placeholder="Confirmar nova senha"
          value={passwordForm.confirmPassword}
          onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
        />

        <Button type="submit" disabled={savingPassword} variant="secondary" fullWidth>
          {savingPassword ? 'Atualizando...' : 'Atualizar senha'}
        </Button>
      </form>
    </PageShell>
  );
}
