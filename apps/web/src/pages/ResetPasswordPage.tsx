import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { Alert, Button, ButtonLink, CenteredState, TextInput } from '../components/ui.js';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const validToken = /^[A-Za-z0-9_-]{20,300}$/.test(token);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!validToken) {
      setError('Link de redefinição inválido. Solicite um novo link.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword({ token, newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      window.history.replaceState(window.history.state, '', '/reset-password');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setInvalidLink(true);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível redefinir a senha. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <CenteredState>
        <div className="w-full max-w-sm space-y-4 text-center" role="status">
          <h1 className="text-2xl font-bold">Senha redefinida</h1>
          <p className="text-sm text-neutral-400">
            Sua nova senha foi salva. Entre com o seu e-mail e a nova senha.
          </p>
          <ButtonLink to="/login" fullWidth>
            Ir para o login
          </ButtonLink>
        </div>
      </CenteredState>
    );
  }

  if (!validToken || invalidLink) {
    return (
      <CenteredState>
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Link inválido ou expirado</h1>
          <p className="text-sm text-neutral-400">
            O link pode já ter sido usado ou ter expirado. Solicite outro para recuperar seu acesso.
          </p>
          <ButtonLink to="/forgot-password" fullWidth>
            Solicitar novo link
          </ButtonLink>
          <Link to="/login" className="block text-sm text-orange-500">
            Voltar para o login
          </Link>
        </div>
      </CenteredState>
    );
  }

  return (
    <CenteredState>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Nova senha</h1>
          <p className="text-sm text-neutral-500">Escolha uma senha com pelo menos 8 caracteres.</p>
        </div>

        {error && (
          <div role="alert">
            <Alert>{error}</Alert>
          </div>
        )}

        <label htmlFor="new-password" className="block text-sm text-neutral-300">
          Nova senha
        </label>
        <TextInput
          id="new-password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          disabled={submitting}
          required
          minLength={8}
          placeholder="Nova senha"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <label htmlFor="confirm-password" className="block text-sm text-neutral-300">
          Confirmar nova senha
        </label>
        <TextInput
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          disabled={submitting}
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
