import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { NavBar } from '../components/NavBar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Button, PageShell, TextArea, TextInput } from '../components/ui.js';

export function SubmitHyroxPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setImageFile(file: File | null) {
    setImage(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
    setError(null);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setImageFile(event.target.files?.[0] ?? null);
  }

  function clearImage() {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  useEffect(() => {
    function onWindowPaste(event: globalThis.ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        setImageFile(file);
      }
    }
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!rawText.trim() && !image) {
      setError('Cole o texto do treino ou envie uma foto dele.');
      return;
    }

    setSubmitting(true);
    try {
      const { workout } = await api.submitHyroxWorkout({
        rawText: rawText.trim() || undefined,
        name: name.trim() || undefined,
        image: image ?? undefined,
      });
      navigate(`/hyrox/${workout.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel enviar o treino HYROX.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Enviar HYROX</h1>
          <div className="flex items-center gap-3">
            <BrandHomeLink />
            <Link to="/hyrox" className="text-sm text-neutral-400">
              Historico
            </Link>
          </div>
        </div>
      </PageHeader>

      <NavBar />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <TextInput
          type="text"
          placeholder="Nome do treino (opcional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <TextArea
          placeholder={
            'Cole aqui o treino HYROX que voce recebeu do box...\n\nEx:\n4 rounds for time\n1 km Run\n500m SkiErg\n20m Sled Push\n25 Wall Balls'
          }
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          rows={8}
          className="font-mono text-sm"
        />

        <div className="text-center text-sm text-neutral-500">— ou —</div>

        {imagePreviewUrl ? (
          <div className="relative">
            <img
              src={imagePreviewUrl}
              alt="Previa do treino"
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
          <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-700 px-4 py-8 text-center text-sm text-neutral-400">
            <span>Tirar foto ou escolher imagem do treino</span>
            <span className="text-xs text-neutral-500">ou cole um print com Ctrl+V</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </label>
        )}

        <Button type="submit" disabled={submitting} fullWidth>
          {submitting ? 'Enviando...' : 'Enviar HYROX'}
        </Button>
      </form>
    </PageShell>
  );
}
