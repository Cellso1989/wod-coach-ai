import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { ApiError } from '../lib/api.js';
import { Alert, Button, CenteredState, TextInput } from '../components/ui.js';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(name, email, password);
      navigate('/profile');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredState>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Criar conta</h1>
          <p className="text-sm text-neutral-500">Configure seu perfil e acompanhe sua evolução.</p>
        </div>

        {error && <Alert>{error}</Alert>}

        <TextInput
          type="text"
          required
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          minLength={8}
          placeholder="Senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" disabled={submitting} fullWidth>
          {submitting ? 'Criando...' : 'Criar conta'}
        </Button>

        <p className="text-center text-sm text-neutral-400">
          Já tem conta?{' '}
          <Link to="/login" className="text-orange-500">
            Entrar
          </Link>
        </p>
      </form>
    </CenteredState>
  );
}
