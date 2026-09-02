import { Link, useLocation } from "react-router-dom";

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/wods", icon: "🏋️", label: "Meus WODs" },
  { to: "/personal-records", icon: "🏆", label: "PRs" },
  { to: "/profile", icon: "👤", label: "Perfil" },
];

export function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="flex gap-2">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors duration-150 ${
              active
                ? "border-orange-600 bg-orange-600/10 text-orange-400"
                : "border-[#303030] bg-[#181818] text-neutral-100 hover:border-orange-900/60 hover:bg-[#202020]"
            }`}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
