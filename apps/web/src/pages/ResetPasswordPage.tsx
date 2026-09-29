import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { Alert, Button, CenteredState, TextInput } from '../components/ui.js';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('Link de redefinicao invalido.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas nao conferem.');
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword({ token, newPassword });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredState>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Nova senha</h1>
          <p className="text-sm text-neutral-500">Escolha uma senha com pelo menos 8 caracteres.</p>
        </div>

        {error && <Alert>{error}</Alert>}

        <TextInput
          type="password"
          required
          minLength={8}
          placeholder="Nova senha"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <TextInput
          type="password"
          required
          minLength={8}
          placeholder="Confirmar nova senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <Button type="submit" disabled={submitting || !token} fullWidth>
          {submitting ? 'Salvando...' : 'Redefinir senha'}
        </Button>

        <p className="text-center text-sm text-neutral-400">
          <Link to="/login" className="text-orange-500">
            Voltar para o login
          </Link>
        </p>
      </form>
    </CenteredState>
  );
}
