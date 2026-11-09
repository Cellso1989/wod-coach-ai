import { lazy } from 'react';

// Keep one loader per route for both React and navigation intent prefetch.
const loaders = {
  profile: () => import('../pages/ProfilePage.js').then((m) => ({ default: m.ProfilePage })),
  checkin: () => import('../pages/CheckinPage.js').then((m) => ({ default: m.CheckinPage })),
  wods: () => import('../pages/WodListPage.js').then((m) => ({ default: m.WodListPage })),
  wod: () => import('../pages/WodDetailPage.js').then((m) => ({ default: m.WodDetailPage })),
  submitWod: () => import('../pages/SubmitWodPage.js').then((m) => ({ default: m.SubmitWodPage })),
  records: () =>
    import('../pages/PersonalRecordsPage.js').then((m) => ({ default: m.PersonalRecordsPage })),
  ranking: () => import('../pages/RankingPage.js').then((m) => ({ default: m.RankingPage })),
  hyrox: () => import('../pages/HyroxPage.js').then((m) => ({ default: m.HyroxPage })),
  hyroxDetail: () =>
    import('../pages/HyroxDetailPage.js').then((m) => ({ default: m.HyroxDetailPage })),
  submitHyrox: () =>
    import('../pages/SubmitHyroxPage.js').then((m) => ({ default: m.SubmitHyroxPage })),
  admin: () => import('../pages/AdminPage.js').then((m) => ({ default: m.AdminPage })),
  preview: () =>
    import('../pages/StrategyPreviewPage.js').then((m) => ({ default: m.StrategyPreviewPage })),
};

export const ProfilePage = lazy(loaders.profile);
export const CheckinPage = lazy(loaders.checkin);
export const WodListPage = lazy(loaders.wods);
export const WodDetailPage = lazy(loaders.wod);
export const SubmitWodPage = lazy(loaders.submitWod);
export const PersonalRecordsPage = lazy(loaders.records);
export const RankingPage = lazy(loaders.ranking);
export const HyroxPage = lazy(loaders.hyrox);
export const HyroxDetailPage = lazy(loaders.hyroxDetail);
export const SubmitHyroxPage = lazy(loaders.submitHyrox);
export const AdminPage = lazy(loaders.admin);
export const StrategyPreviewPage = lazy(loaders.preview);

const routeKeys: Record<string, keyof typeof loaders> = {
  '/wods': 'wods',
  '/hyrox': 'hyrox',
  '/profile': 'profile',
  '/checkin': 'checkin',
  '/personal-records': 'records',
  '/ranking': 'ranking',
  '/admin': 'admin',
  '/strategy': 'preview',
};

export function preloadRoutePage(path: string) {
  const route = path.replace(/^\/preview(?=\/)/, '');
  const key =
    route === '/wods/new'
      ? 'submitWod'
      : route.startsWith('/wods/')
        ? 'wod'
        : route === '/hyrox/new'
          ? 'submitHyrox'
          : route.startsWith('/hyrox/')
            ? 'hyroxDetail'
            : routeKeys[route];
  if (key) void loaders[key]().catch(() => {});
}
