import { ClipboardPaste, Image as ImageIcon, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { BrandHomeLink } from '../components/BrandHomeLink.js';
import { NavBar } from '../components/NavBar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Alert, Button, PageShell, TextArea, TextInput } from '../components/ui.js';

export function SubmitWodPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  const [rawText, setRawText] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pasteAreaFocused, setPasteAreaFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setImageFile = useCallback((file: File | null) => {
    setImage(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
    setError(null);
  }, []);

  function clearImage() {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleImagePaste = useCallback(
    (event: Pick<globalThis.ClipboardEvent, 'clipboardData' | 'preventDefault'>) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        setImageFile(file);
      }
    },
    [setImageFile],
  );

  useEffect(() => {
    function onWindowPaste(event: globalThis.ClipboardEvent) {
      if (event.defaultPrevented) return;
      handleImagePaste(event);
    }

    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [handleImagePaste]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!rawText.trim() && !image) {
      setError('Cole o texto do treino, envie uma foto ou cole uma imagem dele.');
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
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o WOD.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Enviar WOD</h1>
          <div className="flex items-center gap-3">
            <BrandHomeLink />
            <Link to="/wods" className="text-sm text-neutral-400">
              Histórico
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
            'Cole aqui o WOD que você recebeu do seu box...\n\nEx:\n15 min AMRAP\n10 Toes to Bar\n15 Wall Balls\n200m Run'
          }
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          rows={8}
          className="font-mono text-sm"
        />

        <div className="text-center text-sm text-neutral-500">- ou -</div>

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
              className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-neutral-950/85 px-3 py-1 text-xs text-neutral-100"
            >
              <X size={12} aria-hidden="true" />
              Remover
            </button>
          </div>
        ) : (
          <div
            ref={pasteAreaRef}
            tabIndex={0}
            role="group"
            aria-label="Imagem do treino"
            onClick={() => pasteAreaRef.current?.focus()}
            onFocus={() => setPasteAreaFocused(true)}
            onBlur={() => setPasteAreaFocused(false)}
            onPaste={(event) => handleImagePaste(event.nativeEvent)}
            className={[
              'flex min-h-28 w-full cursor-text flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center transition-colors',
              pasteAreaFocused
                ? 'border-orange-500 bg-orange-950/20 text-neutral-100'
                : 'border-neutral-700 bg-neutral-950/40 text-neutral-300 hover:border-neutral-500 hover:bg-neutral-900/50',
            ].join(' ')}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-orange-400">
              {pasteAreaFocused ? (
                <ClipboardPaste size={20} aria-hidden="true" />
              ) : (
                <ImageIcon size={20} aria-hidden="true" />
              )}
            </span>
            <span className="text-sm font-semibold">Cole a imagem aqui</span>
            <span className="text-xs text-neutral-500">
              Copie o print do treino e pressione Ctrl+V
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-md border border-neutral-600 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
            >
              <ImageIcon size={16} aria-hidden="true" />
              Tirar foto ou escolher imagem do treino
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />

        <Button type="submit" disabled={submitting} fullWidth>
          {submitting ? 'Enviando...' : 'Enviar WOD'}
        </Button>
      </form>
    </PageShell>
  );
}
