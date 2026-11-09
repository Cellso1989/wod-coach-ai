import { buildApp } from './app.js';
import {
  claimGenerationJob,
  executeGenerationJob,
  pruneGenerationJobs,
} from './services/wod-generation-jobs.js';
import { reportWorkerFailure } from './services/external-monitoring.js';

const app = buildApp({ backgroundTasks: false });
let stopping = false;
let nextPrune = Date.now() + 60 * 60_000;
let wake: (() => void) | undefined;
function stop() {
  stopping = true;
  wake?.();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
await app.ready();
app.log.info({ event: 'wod_generation_worker_started' }, 'CrossFit generation worker started');
try {
  while (!stopping) {
    try {
      const job = await claimGenerationJob();
      if (job) {
        await executeGenerationJob(app, job);
        continue;
      }
      if (Date.now() >= nextPrune) {
        await pruneGenerationJobs();
        nextPrune = Date.now() + 60 * 60_000;
      }
    } catch {
      app.log.error({ code: 'WOD_GENERATION_WORKER_FAILED' }, 'Generation worker iteration failed');
      reportWorkerFailure();
    }
    if (!stopping)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wake = undefined;
          resolve();
        }, 2000);
        wake = () => {
          clearTimeout(timer);
          wake = undefined;
          resolve();
        };
      });
  }
} finally {
  await app.close();
}
