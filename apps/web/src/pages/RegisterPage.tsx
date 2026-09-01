import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { ApiError } from "../lib/api.js";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(name, email, password);
      navigate("/profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a conta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Criar conta</h1>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <input
          type="text"
          required
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-base"
        />
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
          minLength={8}
          placeholder="Senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-base"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
        >
          {submitting ? "Criando..." : "Criar conta"}
        </button>

        <p className="text-center text-sm text-neutral-400">
          Já tem conta?{" "}
          <Link to="/login" className="text-orange-500">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
