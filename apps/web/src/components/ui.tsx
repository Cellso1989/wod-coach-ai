import { Eye, EyeOff } from 'lucide-react';
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle.js';

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100">
      <div className="mx-auto max-w-md space-y-6">{children}</div>
    </main>
  );
}

export function CenteredState({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {children}
    </main>
  );
}

export function LoadingState({ message = 'Carregando...' }: { message?: string }) {
  return (
    <CenteredState>
      <p className="text-sm text-neutral-400">{message}</p>
    </CenteredState>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-neutral-800 bg-neutral-900 p-4', className)}>
      {children}
    </div>
  );
}

export function Alert({
  children,
  variant = 'error',
}: {
  children: ReactNode;
  variant?: 'error' | 'success' | 'info';
}) {
  const styles = {
    error: 'border-red-900/60 bg-red-950/30 text-red-300',
    success: 'border-green-900/60 bg-green-950/30 text-green-300',
    info: 'border-neutral-800 bg-neutral-900 text-neutral-300',
  }[variant];

  return <p className={cn('rounded-lg border px-3 py-2 text-sm', styles)}>{children}</p>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="space-y-3 text-center">
      <div>
        <p className="font-semibold text-neutral-100">{title}</p>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {action}
    </Card>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  fullWidth,
  type = 'button',
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700 active:bg-orange-800',
    secondary:
      'border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-orange-900/60 hover:bg-neutral-900',
    danger: 'border-red-900/70 bg-red-950/20 text-red-300 hover:border-red-700 hover:bg-red-950/40',
    ghost: 'border-transparent bg-transparent text-neutral-400 hover:text-neutral-100',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'w-full',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function ButtonLink({
  className,
  variant = 'primary',
  fullWidth,
  ...props
}: ButtonLinkProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700 active:bg-orange-800',
    secondary:
      'border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-orange-900/60 hover:bg-neutral-900',
    danger: 'border-red-900/70 bg-red-950/20 text-red-300 hover:border-red-700 hover:bg-red-950/40',
    ghost: 'border-transparent bg-transparent text-neutral-400 hover:text-neutral-100',
  };

  return (
    <Link
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors duration-150',
        fullWidth && 'w-full',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [showPassword, setShowPassword] = useState(false);
  const generatedId = useId();
  const isPassword = props.type === 'password';
  const inputId = props.id ?? (isPassword ? generatedId : undefined);
  const input = (
    <input
      className={cn(
        'w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500 focus:border-orange-700 focus:outline-none',
        className,
        isPassword && 'pr-12',
      )}
      {...props}
      id={inputId}
      type={isPassword && showPassword ? 'text' : props.type}
    />
  );

  if (!isPassword) return input;

  const label = showPassword ? 'Ocultar senha' : 'Mostrar senha';
  return (
    <div className="relative">
      {input}
      <button
        type="button"
        aria-label={label}
        aria-controls={inputId}
        aria-pressed={showPassword}
        title={label}
        disabled={props.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShowPassword((visible) => !visible)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-neutral-400 hover:text-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {showPassword ? (
          <EyeOff size={20} aria-hidden="true" />
        ) : (
          <Eye size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500 focus:border-orange-700 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 focus:border-orange-700 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-neutral-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}
