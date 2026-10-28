import type { AccessStatus } from '@prisma/client';

export function accessDenied(user: { accessStatus: AccessStatus }): string | null {
  if (user.accessStatus === 'BLOCKED')
    return 'Seu acesso está bloqueado. Fale com o administrador.';
  if (user.accessStatus !== 'APPROVED') return 'Seu cadastro aguarda aprovação do administrador.';
  return null;
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  accessStatus: AccessStatus;
  isAdmin: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    accessStatus: user.accessStatus,
    isAdmin: user.isAdmin,
  };
}
