import { useTheme } from '../lib/theme-context.js';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === 'dark' ? 'Claro' : 'Escuro';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-100 transition-colors duration-150 hover:border-orange-900/60 hover:bg-neutral-800"
      aria-label={`Mudar para tema ${nextLabel.toLowerCase()}`}
      title={`Mudar para tema ${nextLabel.toLowerCase()}`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      {nextLabel}
    </button>
  );
}
