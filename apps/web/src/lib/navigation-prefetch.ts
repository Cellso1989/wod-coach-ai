import { api } from './api.js';

// Fetch only the destination the athlete points to; avoid loading every tab at startup.
export function preloadNavigation(path: string) {
  const read = {
    '/wods': () => api.listWods(100),
    '/hyrox': () => api.listHyroxWorkouts(100),
    '/personal-records': () => api.listPersonalRecords(),
    '/profile': () => api.getAthleteProfile(),
  }[path];
  void read?.().catch(() => {});
}
