// Test-only provider: never registered for production use. Returns a canned answer or throws a given error.
module.exports = function mock({ reply, error, record } = {}) {
  return { name: 'mock', async complete(messages) { if (record) record.push(messages); if (error) throw error; return typeof reply === 'function' ? reply(messages) : reply; } };
};
