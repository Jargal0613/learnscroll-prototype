# LearnScroll

A minimal study feed for five textbooks. Pick a book, pick a chapter, scroll through one idea per screen, then answer a few practice questions. Live at https://learn.jargal.me.

- `index.html`: markup and styles. `app.js`: the app (hash routing, library, chapter list, reader with keyboard (↑↓←→/space/esc) and prev/next navigation, progress in `localStorage`).
- `data/<book>.json`: chapters → cards (`s` section, `h` heading, `t` text, optional `eq` LaTeX, `def`, `ex`) → `quiz`. A chapter without `cards` is listed as "coming soon".

Cards are original study notes summarizing each section; no textbook text, figures or problems are included.
