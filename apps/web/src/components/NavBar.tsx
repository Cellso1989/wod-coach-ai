import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NotificationCenter } from './NotificationCenter.js';

interface NavItem {
  to: string;
  icon?: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '🏠', label: 'Início' },
  { to: '/wods', icon: '🏋️', label: 'CrossFit' },
  { to: '/hyrox', icon: '🏃', label: 'HYROX' },
  { to: '/personal-records', icon: '💪', label: 'PRs' },
  { to: '/ranking', icon: '🏆', label: 'Ranking' },
  { to: '/profile', icon: '👤', label: 'Perfil' },
];

function isActiveNavItem(pathname: string, item: NavItem) {
  if (item.to === '/') return pathname === '/';
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function NavBar() {
  const { pathname } = useLocation();
  const navigationPath =
    import.meta.env.DEV && pathname.startsWith('/preview/')
      ? pathname.slice('/preview'.length)
      : pathname;
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const activeItem = NAV_ITEMS.find((item) => isActiveNavItem(navigationPath, item));

  useEffect(() => {
    const nav = navRef.current;
    const item = activeItem && itemRefs.current[activeItem.to];
    if (!nav || !item) return;

    const revealActiveItem = () => {
      if (!nav.clientWidth) return;
      // Scroll only the menu; scrolling ancestors can shift the page on mobile.
      const itemLeft = item.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollTo({
        left: nav.scrollLeft + itemLeft - (nav.clientWidth - item.clientWidth) / 2,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    };
    // The intro initially hides the menu, so wait for its visible dimensions too.
    const observer = new ResizeObserver(revealActiveItem);
    observer.observe(nav);
    revealActiveItem();
    return () => observer.disconnect();
  }, [activeItem]);

  return (
    <div className="flex min-w-0 items-start gap-2">
      <nav
        ref={navRef}
        className="flex min-w-0 max-w-full flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActiveNavItem(navigationPath, item);
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
      <NotificationCenter />
    </div>
  );
}
