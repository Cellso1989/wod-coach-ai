import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle.js';

export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">{children}</div>
      <ThemeToggle />
    </div>
  );
}
