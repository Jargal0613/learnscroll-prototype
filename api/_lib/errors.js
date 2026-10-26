class TutorError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
const E = {
  bad: m => new TutorError('bad_request', m, 400),
  notConfigured: () => new TutorError('not_configured', 'The tutor is not configured yet: no AI provider credentials are set on the server.', 503),
  timeout: () => new TutorError('timeout', 'The AI provider took too long to answer. Please try again.', 504),
  rateLimited: () => new TutorError('rate_limited', 'The AI provider is rate-limiting requests. Wait a moment and try again.', 429),
  provider: m => new TutorError('provider_error', m || 'The AI provider returned an error.', 502),
};
// Anything unexpected becomes a generic 500 without leaking details.
function toResponse(err) {
  if (err instanceof TutorError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  return { status: 500, body: { error: { code: 'internal', message: 'Something went wrong on the server.' } } };
}
module.exports = { TutorError, E, toResponse };
