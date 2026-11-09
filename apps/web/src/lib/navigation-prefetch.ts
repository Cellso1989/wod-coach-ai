import { api } from './api.js';
import { preloadRoutePage } from './route-pages.js';

// Fetch only the destination the athlete points to; avoid loading every tab at startup.
export function preloadNavigation(path: string) {
  preloadRoutePage(path);
  const read = {
    '/': () => Promise.all([api.listWods(20), api.getTodayCheckin()]),
    '/checkin': () => api.getTodayCheckin(),
    '/wods': () => api.listWods(100),
    '/hyrox': () => api.listHyroxWorkouts(100),
    '/personal-records': () => api.listPersonalRecords(),
    '/profile': () => api.getAthleteProfile(),
  }[path];
  void read?.().catch(() => {});
}
