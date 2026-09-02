import { useAuth } from "../lib/auth-context.js";

export function LogoutButton() {
  const { logout } = useAuth();

  return (
    <button
      onClick={() => void logout()}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-[#303030] bg-transparent px-3 text-sm text-neutral-400 transition-colors duration-150 hover:border-red-900/60 hover:text-red-400"
    >
      <span aria-hidden="true">↪</span>
      Sair
    </button>
  );
}
