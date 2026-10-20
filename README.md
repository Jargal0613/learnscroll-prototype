# LearnScroll prototype

A vertical scroll feed of bite-sized learning content (single static `index.html`, no backend). Live: https://learn.jargal.me

- **Feed**: Posts and Articles filtered by topic and type; ↑/↓/Space to move, 1–4 to rate recall.
- **Quizzes**: a quick multiple-choice check after every few cards (built-in questions + auto fill-in-the-blank for your material).
- **Spaced repetition**: Again/Hard/Good/Easy ratings on every card (SM-2-like); due cards resurface with a *Review* badge and a *Due* filter. Wrong answers are scheduled automatically.
- **Add material**: paste text or pick .txt/.md/.pdf (PDF text extracted client-side with pdf.js from a CDN); split into sequential cards.
- **Custom topics** (create/rename/delete) and a **Progress** panel per topic.

All progress lives in `localStorage` (`learnscroll-v5`; older `learnscroll-topics-v4` progress is migrated).
