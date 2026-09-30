import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  icon?: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '🏠', label: 'Início' },
  { to: '/wods/new', icon: '+', label: 'Novo WOD' },
  { to: '/wods', icon: '🏋️', label: 'Meus WODs' },
  { to: '/hyrox', label: 'HYROX' },
  { to: '/personal-records', icon: '🏆', label: 'PRs' },
  { to: '/profile', icon: '👤', label: 'Perfil' },
];

function isActiveNavItem(pathname: string, item: NavItem) {
  if (item.to === '/') return pathname === '/';
  if (item.to === '/wods') return pathname === '/wods' || /^\/wods\/(?!new(?:\/|$))/.test(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function NavBar() {
  const { pathname } = useLocation();
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const activeItem = NAV_ITEMS.find((item) => isActiveNavItem(pathname, item));

  useEffect(() => {
    if (!activeItem) return;

    itemRefs.current[activeItem.to]?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeItem]);

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV_ITEMS.map((item) => {
        const active = isActiveNavItem(pathname, item);
        return (
          <Link
            key={item.to}
            ref={(element) => {
              itemRefs.current[item.to] = element;
            }}
            to={item.to}
            className={`flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors duration-150 ${
              active
                ? 'border-orange-600 bg-orange-600/10 text-orange-400'
                : 'border-neutral-800 bg-neutral-900 text-neutral-100 hover:border-orange-900/60 hover:bg-neutral-800'
            }`}
          >
            {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
