// Provider registry. Select with TUTOR_PROVIDER; credentials stay server-side in env vars.
const { E } = require('../errors');
const openaiCompatible = require('./openai-compatible');

const registry = { 'openai-compatible': openaiCompatible };

function getProvider(env = process.env) {
  const name = (env.TUTOR_PROVIDER || 'openai-compatible').trim();
  const make = registry[name];
  if (!make || !env.TUTOR_API_KEY || !env.TUTOR_MODEL) throw E.notConfigured();
  return make({ apiKey: env.TUTOR_API_KEY, model: env.TUTOR_MODEL, baseUrl: env.TUTOR_BASE_URL, timeoutMs: Number(env.TUTOR_TIMEOUT_MS) || 25000, maxTokens: Number(env.TUTOR_MAX_TOKENS) || 900 });
}
module.exports = { getProvider, registry };
