// Provider registry. Credentials stay server-side in env vars.
//  - openai (default when OPENAI_API_KEY is set): official SDK, Responses API + File Search (OPENAI_MODEL).
//  - openai-compatible: any /chat/completions endpoint with local BM25 retrieval (TUTOR_API_KEY, TUTOR_MODEL, TUTOR_BASE_URL).
const { E } = require('../errors');

const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

function getProvider(env = process.env) {
  const name = (env.TUTOR_PROVIDER || (env.OPENAI_API_KEY ? 'openai' : 'openai-compatible')).trim();
  if (name === 'openai') {
    if (!env.OPENAI_API_KEY) throw E.notConfigured();
    return require('./openai')({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL, timeoutMs: Number(env.TUTOR_TIMEOUT_MS) || 45000, maxOutputTokens: Number(env.TUTOR_MAX_TOKENS) || 2500 });
  }
  if (name === 'openai-compatible') {
    if (!env.TUTOR_API_KEY || !env.TUTOR_MODEL) throw E.notConfigured();
    return require('./openai-compatible')({ apiKey: env.TUTOR_API_KEY, model: env.TUTOR_MODEL, baseUrl: env.TUTOR_BASE_URL, timeoutMs: Number(env.TUTOR_TIMEOUT_MS) || 25000, maxTokens: Number(env.TUTOR_MAX_TOKENS) || 900 });
  }
  throw E.notConfigured();
}
module.exports = { getProvider, DEFAULT_OPENAI_MODEL };
