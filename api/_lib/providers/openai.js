// OpenAI provider: official SDK, Responses API + File Search over a per-book vector store.
const OpenAI = require('openai');
const { E } = require('../errors');

function mapError(e) {
  if (e instanceof OpenAI.APIConnectionTimeoutError || e.name === 'APIConnectionTimeoutError') return E.timeout();
  if (e.status === 429) return e.code === 'insufficient_quota' ? E.provider('The OpenAI account is out of quota.') : E.rateLimited();
  if (e.status === 401 || e.status === 403) return E.provider('OpenAI rejected the server credentials.');
  if (e instanceof OpenAI.APIConnectionError) return E.provider('Could not reach OpenAI.');
  if (e.status) return E.provider(`OpenAI returned an error (HTTP ${e.status}).`);
  return E.provider('OpenAI request failed.');
}

module.exports = function openaiProvider({ apiKey, model, timeoutMs = 45000, maxOutputTokens = 2500, reasoningEffort = 'low', client }) {
  const sdk = client || new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  return {
    name: 'openai', kind: 'file_search', model,
    // input: Responses API input items; returns { text, citations: [{ fileId, filename }], results: n, usage }
    async respond({ instructions, input, vectorStoreId, format }) {
      let r;
      try {
        r = await sdk.responses.create({
          model, instructions, input, store: false,
          reasoning: { effort: reasoningEffort },
          max_output_tokens: maxOutputTokens,
          tools: [{ type: 'file_search', vector_store_ids: [vectorStoreId], max_num_results: 8 }],
          include: ['file_search_call.results'],
          ...(format ? { text: { format } } : {}),
        });
      } catch (e) { throw mapError(e); }
      if (r.status === 'incomplete' && !r.output_text) throw E.provider('OpenAI stopped before finishing the answer.');
      const citations = [];
      let results = 0, searched = false;
      const passages = [];
      for (const item of r.output || []) {
        if (item.type === 'file_search_call') {
          searched = true; results += (item.results || []).length;
          for (const x of item.results || []) if (x && typeof x.text === 'string') passages.push({ fileId: x.file_id, filename: x.filename, score: Number(x.score) || 0, text: x.text, attributes: x.attributes || {} });
        }
        if (item.type === 'message') for (const part of item.content || []) for (const a of part.annotations || []) {
          if (a.type === 'file_citation') citations.push({ fileId: a.file_id, filename: a.filename });
        }
      }
      const text = r.output_text || '';
      if (!text) throw E.provider('OpenAI returned an empty answer.');
      const u = r.usage || {};
      return { text, citations, passages, searched, results, usage: { input: u.input_tokens || 0, cached: (u.input_tokens_details || {}).cached_tokens || 0, output: u.output_tokens || 0, reasoning: (u.output_tokens_details || {}).reasoning_tokens || 0 } };
    },
  };
};
module.exports.mapError = mapError;
