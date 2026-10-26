// Minimal Upstash Redis REST client for rate-limit counters (no SDK). Reads the env vars the Vercel Marketplace
// Upstash integration injects. Returns null when not configured; callers must then refuse (fail closed).
function upstashStore(env = process.env, fetchImpl = globalThis.fetch) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return {
    async incr(key, ttl) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
      try {
        const r = await fetchImpl(url.replace(/\/$/, '') + '/pipeline', { method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttl), 'NX']]) });
        if (!r.ok) throw new Error('limiter http ' + r.status);
        const j = await r.json(); const n = j && j[0] && j[0].result;
        if (!Number.isInteger(n)) throw new Error('limiter bad reply');
        return n;
      } finally { clearTimeout(t); }
    },
  };
}
module.exports = { upstashStore };
