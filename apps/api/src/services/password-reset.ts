import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@wod-coach-ai/database';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_UNAVAILABLE =
  'A recuperação por e-mail está indisponível. Peça um link de recuperação ao administrador.';

export function passwordResetBaseUrl(): string | null {
  const configured =
    process.env.PASSWORD_RESET_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
  const base =
    configured || (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '');
  try {
    const url = new URL(base);
    if (
      (url.protocol !== 'https:' &&
        !(process.env.NODE_ENV === 'development' && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function passwordResetEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

export function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createPasswordReset(userId: string, baseUrl: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const record = await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashResetToken(token), expiresAt },
    select: { id: true },
  });
  return { id: record.id, resetUrl: `${baseUrl}/reset-password?token=${token}`, expiresAt };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

type DeliveryResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason: 'provider_rejected' | 'network_error' | 'invalid_response';
      status?: number;
    };

export async function sendPasswordResetEmail(
  configuration: NonNullable<ReturnType<typeof passwordResetEmailConfiguration>>,
  to: string,
  resetUrl: string,
): Promise<DeliveryResult> {
  const safeUrl = escapeHtml(resetUrl);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: configuration.from,
        to,
        subject: 'Redefinir senha do WOD Coach AI',
        text: `Recebemos uma solicitação para redefinir sua senha do WOD Coach AI.\n\nUse este link: ${resetUrl}\n\nO link expira em 1 hora e pode ser usado uma única vez. Se você não solicitou a troca, ignore este e-mail. Sua senha continua a mesma.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171717"><h1>WOD Coach AI</h1><h2>Redefinir sua senha</h2><p>Recebemos uma solicitação para recuperar o acesso à sua conta.</p><p><a href="${safeUrl}" style="display:inline-block;background:#ea580c;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none">Criar nova senha</a></p><p>Este link expira em <strong>1 hora</strong> e pode ser usado uma única vez.</p><p>Se o botão não abrir, copie este endereço para o navegador:</p><p style="word-break:break-all">${safeUrl}</p><p>Se você não solicitou a troca, ignore este e-mail. Sua senha continua a mesma.</p></div>`,
      }),
    });
    // Never log provider bodies: they can echo addresses, credentials or reset links.
    if (!response.ok) return { ok: false, reason: 'provider_rejected', status: response.status };
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,128}$/.test(body.id)
    ) {
      return { ok: false, reason: 'invalid_response', status: response.status };
    }
    return { ok: true, messageId: body.id };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export class InvalidPasswordResetError extends Error {}

export async function consumePasswordReset(
  resetToken: { id: string; userId: string },
  passwordHash: string,
) {
  await prisma.$transaction(async (tx) => {
    // Lock the user first to serialize resets from different links for the same account.
    // If the claim fails, throwing rolls this password update back as well.
    await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new InvalidPasswordResetError();
    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    });
  });
}
