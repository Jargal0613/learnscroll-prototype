// Works with any OpenAI-style /chat/completions endpoint (OpenAI, xAI, Groq, Together, OpenRouter, local vLLM/Ollama...).
const { E } = require('../errors');

module.exports = function openaiCompatible({ apiKey, model, baseUrl, timeoutMs, maxTokens, fetchImpl }) {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
  const doFetch = fetchImpl || fetch;
  return {
    name: 'openai-compatible',
    async complete(messages) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let res;
      try {
        res = await doFetch(url, {
          method: 'POST', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens }),
        });
      } catch (e) {
        throw e.name === 'AbortError' ? E.timeout() : E.provider('Could not reach the AI provider.');
      } finally { clearTimeout(timer); }
      if (res.status === 429) throw E.rateLimited();
      if (res.status === 401 || res.status === 403) throw E.provider('The AI provider rejected the server credentials.');
      if (!res.ok) throw E.provider(`The AI provider returned an error (HTTP ${res.status}).`);
      let data;
      try { data = await res.json(); } catch (e) { throw E.provider('The AI provider returned an unreadable response.'); }
      const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw E.provider('The AI provider returned an empty answer.');
      return text;
    },
  };
};
