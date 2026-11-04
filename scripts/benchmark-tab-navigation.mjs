import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const delayMs = 500;
const user = {
  id: 'navigation-fixture',
  name: 'Atleta de teste',
  accessStatus: 'APPROVED',
  isAdmin: false,
};
const wod = {
  id: 'fixture-wod',
  name: 'Treino de navegacao',
  date: '2026-11-03T15:00:00Z',
  rawText: '10 burpees',
  sourceType: 'TEXT',
  result: { score: 'Cap +1' },
};
const record = {
  id: 'fixture-pr',
  movementName: 'Back Squat',
  value: 100,
  unit: 'kg',
  recordType: 'ONE_RM',
  achievedAt: '2026-11-03T15:00:00Z',
  repetitions: null,
  notes: null,
};
const browser = await chromium.launch();
const samples = [];
const steps = [
  { label: 'CrossFit', path: '/wods', ready: 'Treino de navegacao' },
  { label: 'HYROX', path: '/hyrox', ready: 'Simulado HYROX' },
  { label: 'PRs', path: '/personal-records', ready: 'Back Squat' },
  { label: 'Perfil', path: '/profile', ready: 'Participar do Ranking' },
];
try {
  for (const variant of ['before', 'after']) {
    const directory = resolve(
      root,
      variant === 'before' ? 'output/navigation-loading/before' : 'apps/web/dist',
    );
    const server = createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
        const target = resolve(directory, '.' + pathname);
        if (target !== directory && !target.startsWith(directory + sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const isAsset = pathname.startsWith('/assets/') || /\.(png|webmanifest|js)$/.test(pathname);
        const body = await readFile(isAsset ? target : resolve(directory, 'index.html'));
        const type = {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.webmanifest': 'application/manifest+json',
        }[extname(target)];
        res.writeHead(200, {
          'content-type': isAsset ? (type ?? 'application/octet-stream') : 'text/html',
          'cache-control': 'no-store',
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 900 },
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date('2026-11-03T18:00:00Z'));
        const counts = {};
        await page.route('**/api/**', async (route) => {
          const url = new URL(route.request().url());
          const path = url.pathname;
          counts[path] = (counts[path] ?? 0) + 1;
          let body;
          if (path === '/api/auth/me') body = { user };
          else if (path === '/api/wods') body = { wods: [wod] };
          else if (path === '/api/hyrox-workouts')
            body = { workouts: [{ ...wod, id: 'hyrox', name: 'Simulado HYROX' }] };
          else if (path === '/api/personal-records') body = { records: [record] };
          else if (path === '/api/athlete-profile') body = { profile: { rankingOptIn: true } };
          else if (path === '/api/stats/training-calendar') body = { entries: [] };
          else if (path === '/api/checkins/today') body = { checkin: null };
          else if (path === '/api/notifications')
            body = { enabled: false, notifications: [], unreadCount: 0 };
          else if (path === '/api/notifications/push-config') body = { publicKey: null };
          await new Promise((done) => setTimeout(done, delayMs));
          await route
            .fulfill({ status: body ? 200 : 404, json: body ?? { error: 'Not found' } })
            .catch(() => {});
        });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.getByRole('link', { name: 'Ver treino de hoje', exact: true }).waitFor();
        for (let visit = 0; visit < 2; visit++) {
          for (const step of steps) {
            const started = performance.now();
            await page.getByRole('link', { name: step.label, exact: true }).click();
            assert.equal(new URL(page.url()).pathname, step.path);
            await page.getByText(step.ready, { exact: true }).first().waitFor();
            samples.push({
              variant,
              repeat: repeat + 1,
              visit: visit + 1,
              tab: step.label,
              elapsedMs: Math.round(performance.now() - started),
            });
          }
        }
        console.log(JSON.stringify({ variant, repeat: repeat + 1, counts }));
        await context.close();
      }
    } finally {
      await new Promise((done) => server.close(done));
    }
  }
} finally {
  await browser.close();
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = ['before', 'after'].map((variant) => ({
  variant,
  firstVisitMedianMs: median(
    samples.filter((s) => s.variant === variant && s.visit === 1).map((s) => s.elapsedMs),
  ),
  revisitMedianMs: median(
    samples.filter((s) => s.variant === variant && s.visit === 2).map((s) => s.elapsedMs),
  ),
}));
await writeFile(
  resolve(root, 'output/navigation-loading/comparison.json'),
  JSON.stringify({ delayMs, simulatedData: true, summary, samples }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
