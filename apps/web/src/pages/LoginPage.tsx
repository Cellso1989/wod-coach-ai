import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { ApiError } from "../lib/api.js";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Entrar</h1>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-base"
        />
        <input
          type="password"
          required
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-base"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
        >
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-center text-sm text-neutral-400">
          Não tem conta?{" "}
          <Link to="/register" className="text-orange-500">
            Criar conta
          </Link>
        </p>
      </form>
    </main>
  );
}
