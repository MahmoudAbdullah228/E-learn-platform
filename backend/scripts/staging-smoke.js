import { z } from 'zod';

const input = z.strictObject({ api: z.url(), frontend: z.url().optional() });
const checks = [];
async function check(name, url, accepts) {
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const passed = await accepts(response);
    checks.push({ name, status: response.status, passed });
  } catch {
    checks.push({ name, passed: false });
  }
}
try {
  const { api, frontend } = input.parse({ api: process.env.STAGING_API_URL, frontend: process.env.STAGING_FRONTEND_URL });
  const base = new URL(api);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash
      || !/^\/api\/v1\/?$/.test(base.pathname)) throw new Error('Expected API base');
  const root = api.replace(/\/$/, '');
  await check('health', root + '/health', async r => r.ok && (await r.json()).data?.status === 'ok');
  await check('OpenAPI release', root + '/openapi.json', async r => {
    if (!r.ok) return false;
    const doc = await r.json();
    return doc.info?.version === '1.11.0' && Boolean(doc.paths?.['/admin/course-revisions/{revisionId}/approve']?.post);
  });
  await check('public categories', root + '/categories?limit=1', async r => r.ok && Array.isArray((await r.json()).data?.categories));
  await check('anonymous admin access', root + '/admin/dashboard', async r => r.status === 401
    && (await r.json()).error?.code === 'AUTHENTICATION_REQUIRED');
  if (frontend) {
    const origin = new URL(frontend);
    if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.search || origin.hash) throw new Error('Expected frontend URL');
    await check('frontend HTML', origin, async r => r.ok && /text\/html/i.test(r.headers.get('content-type') ?? ''));
  }
  process.stdout.write(JSON.stringify({ observedAt: new Date().toISOString(), checks }) + '\n');
  if (!checks.every(row => row.passed)) process.exitCode = 1;
} catch {
  process.stderr.write('Supply STAGING_API_URL ending in /api/v1 and an optional STAGING_FRONTEND_URL.\n');
  process.exitCode = 1;
}
