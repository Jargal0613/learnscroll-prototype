# LearnScroll tutor

A book-aware tutor panel in the reader ("Ask tutor" in the top bar). Static frontend (`tutor.js`) + one Vercel
Node function (`api/tutor.js`). No framework, no npm dependencies, no database.

## Flow
`POST /api/tutor` → `api/_lib/tutor.js`:
1. **Validate** (`validate.js`): bookId must be one of the 5 known books; chapter and card id must exist in the
   server's own `data/*.json` (the client's card text is ignored; the server copy is used). Question ≤ 2000 chars,
   ≤ 50 messages accepted, last 10 kept, each ≤ 4000 chars, roles `user|assistant` only, scope `card|chapter|book`,
   body ≤ 64 KB.
2. **Retrieve** (`retrieve.js`): BM25 over (a) the private textbook index if present and (b) LearnScroll's own card
   notes. `card`/`chapter` scope filters to the current chapter; `book` scope searches the whole book.
3. **Prompt** (`prompt.js`): grounded system rules (undergrad level, steps, symbol meaning/units/assumptions, LaTeX,
   "Background (not from the book):" separation, admit uncertainty, no invented quotes/pages/formulas, no long
   verbatim passages) + current card + numbered sources `[S1]…` + capped history.
4. **Provider** (`providers/`): selected by env. 
5. **Citations**: only `[S#]` refs that match a retrieved source survive; invalid refs are stripped. The response
   carries source **metadata only** (label, chapter, page, section), never book text. Client-supplied pages are ignored.

Errors are JSON `{ error: { code, message } }`: `bad_request` 400, `method_not_allowed` 405, `rate_limited` 429,
`internal` 500, `provider_error` 502, `not_configured` 503, `timeout` 504. Logs contain error codes only.

## Configure a provider (Vercel → Project → Settings → Environment Variables, server-side only)
| Var | Required | Example |
|---|---|---|
| `TUTOR_PROVIDER` | no (default `openai-compatible`) | `openai-compatible` |
| `TUTOR_API_KEY` | yes | your provider key (never `NEXT_PUBLIC_`/client-visible) |
| `TUTOR_MODEL` | yes | e.g. `gpt-4o-mini`, `grok-3-mini`, `llama-3.1-70b-versatile` |
| `TUTOR_BASE_URL` | no (default `https://api.openai.com/v1`) | `https://api.x.ai/v1`, `https://api.groq.com/openai/v1`, `https://openrouter.ai/api/v1` |
| `TUTOR_TIMEOUT_MS` | no (25000) | |
| `TUTOR_MAX_TOKENS` | no (900) | |

Redeploy after setting them. Without `TUTOR_API_KEY` + `TUTOR_MODEL` the endpoint returns `503 not_configured`
and the panel says "Tutor not configured". Add another vendor by writing `api/_lib/providers/<name>.js` exporting
`(config) => ({ complete(messages) → Promise<string> })` and registering it in `providers/index.js`.

## Textbook index (PRIVATE — never commit or serve it)
The textbooks are copyrighted and this repo is public. The index is built locally and is gitignored
(`private/`) and vercelignored.

```
pdftotext -layout book.pdf /path/text/<bookId>.txt   # one file per book, pages split by form feeds
node scripts/build-index.js /path/text ./private/book-index
```
Each chunk: `{ id: "<book>:p<pdfPage>:<n>", book, chapter, page (PDF page), printedPage (running-head label or
null), section ("1–6 Conduction" when detectable), text }`. Chapter/section detection is heuristic (running heads,
`CHAPTER n`, `cNN.indd`, numbered title-case headings); it can mislabel front/back matter.

Without the index the tutor still works on LearnScroll's own notes, cited as "LearnScroll notes, Ch X card N"
(never as textbook pages). To give production the book index, pick one (none is done yet; needs B's OK):
- **Private Vercel Blob** (private store, read with `BLOB_READ_WRITE_TOKEN` server-side): add a loader in
  `books.getBookIndex` that downloads `<bookId>.json` once per cold start into `/tmp` and set `TUTOR_INDEX_DIR=/tmp/...`.
- **Private repo / build step**: fetch the index during the Vercel build from a private source into a path bundled
  only with the function (`vercel.json` `includeFiles`), never into the static root.
- `TUTOR_INDEX_DIR` points the function at any directory containing `<bookId>.json` files.

Future: OCR'd scanned pages and figure/diagram captions can be added as extra chunks of the same shape (e.g. with
`kind: "figure"` and a figure label); retrieval treats all chunks uniformly. Vector search can replace BM25 behind
`retrieve()` without touching the API.

## Conversations
Stored in the browser only (`localStorage["learnscroll-tutor-v1"][bookId]` = `{ conversationId, messages, draft,
scope }`), kept across card/chapter navigation within a book, cleared by "New conversation". A failed request puts
the question back in the input and the saved draft. No server-side storage, accounts or DB.

## Dev & tests
```
node --test test/                 # unit tests (mock provider; uses private index if built locally)
node scripts/dev-server.js 8787   # static site + /api/tutor locally (never serves private/)
```
