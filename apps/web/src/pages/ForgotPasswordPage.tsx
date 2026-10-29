import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { Alert, Button, CenteredState, TextInput } from '../components/ui.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setDevResetUrl(null);
    setSubmitting(true);
    try {
      const response = await api.forgotPassword({ email });
      setSuccess(true);
      setDevResetUrl(response.devResetUrl ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível solicitar a redefinição. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredState>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Recuperar senha</h1>
          <p className="text-sm text-neutral-500">Informe seu e-mail para receber o link.</p>
        </div>

        <div role={error ? 'alert' : 'status'} aria-live="polite">
          {error && <Alert>{error}</Alert>}
          {success && (
            <Alert variant="info">
              Se este e-mail estiver cadastrado, você receberá as instruções de recuperação. O link
              é de uso único e expira em 1 hora.
            </Alert>
          )}
        </div>
        {devResetUrl && (
          <Alert variant="info">
            Ambiente local:{' '}
            <a href={devResetUrl} className="text-orange-400">
              abrir link de reset
            </a>
          </Alert>
        )}

        <label htmlFor="recovery-email" className="block text-sm text-neutral-300">
          E-mail cadastrado
        </label>
        <TextInput
          id="recovery-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          disabled={submitting}
          required
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Button type="submit" disabled={submitting} fullWidth>
          {submitting ? 'Enviando...' : 'Enviar link'}
        </Button>

        {success && (
          <p className="text-sm text-neutral-400">
            Não recebeu? Confira o endereço e a pasta de spam. Se continuar sem receber, peça um
            link de recuperação ao administrador.
          </p>
        )}

        <p className="text-center text-sm text-neutral-400">
          Lembrou a senha?{' '}
          <Link to="/login" className="text-orange-500">
            Entrar
          </Link>
        </p>
      </form>
    </CenteredState>
  );
}
