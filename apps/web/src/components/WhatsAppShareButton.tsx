import { MessageCircle } from 'lucide-react';
import { whatsappShareUrl } from '../lib/strategy-share.js';

export function WhatsAppShareButton({ message }: { message: string }) {
  return (
    <a
      href={whatsappShareUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-green-700 bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
    >
      <MessageCircle size={18} aria-hidden="true" className="shrink-0" />
      <span>Enviar pelo WhatsApp</span>
    </a>
  );
}
