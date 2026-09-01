import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";

export function SubmitWodPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState("");
  const [name, setName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function clearImage() {
    setImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!rawText.trim() && !image) {
      setError("Cole o texto do treino ou envie uma foto dele.");
      return;
    }

    setSubmitting(true);
    try {
      const { wod } = await api.submitWod({
        rawText: rawText.trim() || undefined,
        name: name.trim() || undefined,
        image: image ?? undefined,
      });
      navigate(`/wods/${wod.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar o WOD.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Enviar WOD</h1>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-neutral-400">
              Início
            </Link>
            <Link to="/wods" className="text-sm text-neutral-400">
              Histórico
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <input
            type="text"
            placeholder="Nome do treino (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
          />

          <textarea
            placeholder={"Cole aqui o WOD que você recebeu do seu box...\n\nEx:\n15 min AMRAP\n10 Toes to Bar\n15 Wall Balls\n200m Run"}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 font-mono text-sm"
          />

          <div className="text-center text-sm text-neutral-500">— ou —</div>

          {imagePreviewUrl ? (
            <div className="relative">
              <img
                src={imagePreviewUrl}
                alt="Prévia do treino"
                className="w-full rounded-lg border border-neutral-800"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 rounded-full bg-neutral-950/80 px-3 py-1 text-xs"
              >
                Remover
              </button>
            </div>
          ) : (
            <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 px-4 py-8 text-sm text-neutral-400">
              📷 Tirar foto ou escolher imagem do treino
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-orange-600 py-3 font-semibold disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Enviar WOD"}
          </button>
        </form>
      </div>
    </main>
  );
}
