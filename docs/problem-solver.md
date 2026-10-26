# Engineering Problem Solver

> **Status (27 Oct 2026):** approved for release with limits **2/min per IP, 10/day per IP, 200/day global**,
> enforced in code (`api/_lib/solver.js` `LIMITS`) via Upstash Redis counters (`api/_lib/upstash.js`).
> Route: `POST /api/solve` (`api/solve.js`). It returns 404 unless `SOLVER_ENABLED=1`, and 503 (`limiter_unavailable`)
> if `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) are missing; a counter error refuses with 429.
> The figures below are the original design numbers (3/20/500); the released limits replace them.

Status: **design only.** The prototype lives on the `problem-solver-design` branch: `api/_lib/solver.js` plus
the mocked tests in `test/solver.test.js`. There is **no API route** that calls it. It also refuses to run unless
`SOLVER_ENABLED=1` is set on the server, which it isn't. No paid calls were made while building it.

## What it would do

A student pastes a textbook-style problem (for example “a 0.2 m wall, k = 0.8 W/m·K, ΔT = 10 K, find q”) while
reading a connected book. The panel answers with a structured worked solution:

- givens (symbol, value, unit), the unknown, and the assumptions;
- the equations in TeX, each with the textbook section **only if a retrieved passage states it**;
- numbered steps showing the substituted numbers and units, then the result with its unit;
- a one-line unit check, and a note on where the source came from.

Rules carried over from the tutor:

- It searches only that book's own vector store, and only for books shown as “Tutor connected”.
- It never invents property values. If a value isn't in the retrieved passages, it asks the student for it.
- Output is strict JSON (`json_schema`, `strict: true`). If the answer is malformed it's rejected and nothing is
  shown, so a half-solution is never rendered.
- Ids only from the client; the server resolves the book itself. The problem text is capped at 3,000 characters.
  Problem text is never logged.

UI (built, hidden): a "Solve a problem" button in the tutor panel, shown only when `GET /api/tutor` reports
`solver: true` (that is `SOLVER_ENABLED=1` **and** the Upstash env vars present). In solve mode the panel sends
`{ bookId, problem }` to `/api/solve` and renders Given / Find / Assumptions / Equation / Substitution / Units /
Answer / Sanity check with KaTeX. Each equation says "From the textbook · <section>" only when the model cites a
section from a retrieved passage, otherwise "Additional explanation"; the answer also keeps separate
"From the textbook" and "Additional explanation" paragraphs (new schema fields `fromTextbook`,
`additionalExplanation`, `sanityCheck`). A 429 shows a calm "Solver limit reached, try again in about N minutes /
tomorrow"; 404/503 show "unavailable"; the problem stays in the box. Solutions are stored locally in the tutor
conversation (and in exports). Tests: `test/e2e/solver.py` (all API calls mocked).

## Cost per solved problem (estimate)

**Measured usage is not available.** The round-6 live tutor calls returned `retrieval.usage`, but it was only
stored in that browser's tutor history. The server logs nothing about content or usage (by design), and no usage
record exists in the repo or on the build box. The token numbers below are therefore **estimates from our own
request settings**, not measurements.

Our settings (from `api/_lib/providers/openai.js`):

- `max_num_results: 8`;
- `max_output_tokens: 2500` for the tutor (the solver would allow up to 4,000);
- reasoning effort low (the solver would use low or medium).

OpenAI File Search chunks files at 800 tokens by default. That is the documented default, and **unverified for
our store**, because we didn't set a chunking strategy.

| Part | Low | Typical | High |
|---|---|---|---|
| Instructions + problem | 1,500 | 1,800 | 2,500 |
| Retrieved chunks (0–8 × ~800) + tool overhead | 3,500 | 6,700 | 9,500 |
| **Input tokens** | **5,000** | **8,500** | **12,000** |
| **Output tokens (incl. reasoning)** | **1,000** | **2,500** | **4,000** |
| File Search tool calls per request | 1 | 1 | 3 |

Prices, verified on 27 Oct 2026 at <https://developers.openai.com/api/docs/pricing> and the
[gpt-6-luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna):

- **gpt-6-luna** (standard, short context ≤272K tokens): input $0.10 per 1M, output $0.50 per 1M.
- **File Search:** tool call $2.50 per 1,000 calls; storage $0.10 per GB per day, 1 GB free.

| | Low | Typical | High |
|---|---|---|---|
| Input | $0.00050 | $0.00085 | $0.00120 |
| Output | $0.00050 | $0.00125 | $0.00200 |
| File Search calls | $0.00250 | $0.00250 | $0.00750 |
| **Per solved problem** | **≈ $0.0035** | **≈ $0.0046** | **≈ $0.0107** |

- The **File Search call fee is the largest part**, so fewer searches per request saves more than shorter answers.
- Whether one request can trigger several searches depends on the model, so the high column assumes 3. That's
  **unverified**.
- Storage: the Heat and Mass Transfer store is 10.26 MB (from `knowledge.json`), well inside the 1 GB free tier.
  The free tier is per account, so whether other stores on the account use it up is **unverified**.
- If a failed check means retrying the request once, plan for roughly twice the per-problem cost.

## Request limits and how the server enforces them

Proposed limits:

- **3 solves per minute** per IP;
- **20 solves per day** per IP (worst case ≈ $0.21 per student per day);
- **500 solves per day** across everyone (worst case ≈ $5.35 per day).

Enforcement, in order (all on the server; the client is never trusted):

1. **Vercel Firewall rate-limit rule** on the solver path, fixed window of 3 per 60 s per IP, returning 429. This
   needs no code, and blocked requests never start a function.
2. **Per-IP daily and global daily counters** in `solver.limit()`. This needs a shared store with atomic increment
   and expiry. Serverless instances share no memory, so a counter in memory alone is not enough.
   - That store would be Upstash Redis (Vercel Marketplace). It's a new data store, so **it needs B's approval**.
   - If the store can't be reached, the limiter **refuses the request** (fail closed). It never lets it through.
3. **OpenAI project budget**: a dedicated project for the solver, with a monthly budget and alert, as the last
   safety net.
4. The 429 response includes `retryAfter`, and the panel says when to try again. Counter keys hold the IP and the
   date only, never the problem text.

## Tests (mocked, on the branch)

`test/solver.test.js` checks the following with a fake provider and an in-memory store (no network):

- Disabled by default: no flag, no provider call.
- Request validation.
- Only this book's vector store is used, and the JSON schema is strict.
- Unconnected books are refused, and malformed output is rejected.
- The per-minute, per-day and global limits work, other students are unaffected, and the limiter fails closed
  when its store is down.

## Before release (decisions for B)

- Approve the counter store, or accept the Firewall per-minute limit only, with no daily caps.
- Run one or two real calls to record actual `usage`, then replace the estimates above.
- UI review in the tutor panel; usability test with a worked problem.
