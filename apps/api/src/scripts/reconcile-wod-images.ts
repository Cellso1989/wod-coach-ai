import { createClient } from '@supabase/supabase-js';
import { prisma } from '@wod-coach-ai/database';

// Explicit maintenance command; dry-run by default. No object paths or credentials in output.
const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const bucket = process.env.WOD_IMAGE_BUCKET ?? 'wod-images';
if (!/^https:\/\/[^/]+\/?$/.test(url) || !key || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket))
  throw Error('Storage maintenance configuration is missing');
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  },
});
async function references() {
  const rows = await prisma.$queryRaw<Array<{ key: string | null }>>`
    SELECT "imageStorageKey" AS key FROM "wods" WHERE "imageStorageKey" IS NOT NULL
    UNION SELECT "sourceSnapshot"->>'imageStorageKey' FROM "wod_analysis_versions" WHERE "sourceSnapshot"->>'imageStorageKey' IS NOT NULL
    UNION SELECT "sourceSnapshot"->>'imageStorageKey' FROM "wod_strategy_versions" WHERE "sourceSnapshot"->>'imageStorageKey' IS NOT NULL`;
  return new Set(rows.flatMap((row) => (row.key ? [row.key] : [])));
}
try {
  const { data: info, error } = await client.storage.getBucket(bucket);
  if (error || !info || info.public !== false) throw Error('A private bucket is required');
  const candidates: string[] = [];
  let visited = 0;
  async function visit(prefix = '', depth = 0) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.storage
        .from(bucket)
        .list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error || !data) throw Error('Storage listing failed');
      for (const object of data) {
        if (++visited > 100_000)
          throw Error('Maintenance safety limit reached; no deletion performed');
        if (!/^[a-zA-Z0-9_-]+$/.test(object.name)) continue;
        const name = prefix ? `${prefix}/${object.name}` : object.name;
        if (!object.id && depth < 2) await visit(name, depth + 1);
        else if (
          object.id &&
          depth === 2 &&
          object.created_at &&
          Number.isFinite(Date.parse(object.created_at)) &&
          Date.parse(object.created_at) < Date.now() - 24 * 60 * 60_000
        )
          candidates.push(name);
      }
      if (data.length < 1000) break;
    }
  }
  await visit();
  const retained = await references();
  const unused = candidates.filter((name) => !retained.has(name));
  let removed = 0;
  if (apply)
    for (let i = 0; i < unused.length; i += 100) {
      const fresh = await references();
      const batch = unused.slice(i, i + 100).filter((name) => !fresh.has(name));
      if (batch.length) {
        const { error } = await client.storage.from(bucket).remove(batch);
        if (error) throw Error('Storage cleanup failed');
        removed += batch.length;
      }
    }
  console.log(
    JSON.stringify({
      dryRun: !apply,
      visited,
      olderThan24Hours: candidates.length,
      unreferenced: unused.length,
      removed,
    }),
  );
} finally {
  await prisma.$disconnect();
}
