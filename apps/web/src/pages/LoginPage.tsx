import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { ApiError } from '../lib/api.js';
import { Alert, Button, CenteredState, TextInput } from '../components/ui.js';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredState>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Entrar</h1>
          <p className="text-sm text-neutral-500">Acesse para analisar seus treinos.</p>
        </div>

        {error && <Alert>{error}</Alert>}

        <TextInput
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          type="password"
          required
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" disabled={submitting} fullWidth>
          {submitting ? 'Entrando...' : 'Entrar'}
        </Button>

        <p className="text-center text-sm text-neutral-400">
          Não tem conta?{' '}
          <Link to="/register" className="text-orange-500">
            Criar conta
          </Link>
        </p>
      </form>
    </CenteredState>
  );
}
