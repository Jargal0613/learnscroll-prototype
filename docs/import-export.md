# Export and import (study data backup)

Everything LearnScroll stores lives in this browser's `localStorage`. **Export study data** (library footer)
downloads one JSON file; **Import study data** reads one back. Nothing is uploaded anywhere.

## What a backup contains (export format version 3)

| Category | Included | Notes |
|---|---|---|
| Progress per book: position, chapters done, cards seen | always | |
| Bookmarks and difficult marks | always | |
| Notes | always | |
| Review results (got it / review again) | always | |
| Quiz attempts | always | |
| Recent history, study-session summaries | always | |
| Preferences: tutor answer style, reading text size, session length/book | always | |
| Tutor conversations (open one, saved ones, your Helpful / Needs improvement feedback on answers, unsent draft) | optional | "include tutor conversations" checkbox, on by default |
| Study session in progress | always | `null` when there is none |
| Formula notebook (equations saved from cards, your own formulas and notes) | always | since format 3 |
| Study sheets (title and the ordered list of picked items; the items themselves are referenced, not copied) | always | since format 3 |

**Never exported or imported (intentionally):** copies of unreadable data kept for recovery
(`*-corrupt-backup`), pre-upgrade copies (`*-pre-schema-N`), the interrupted-import journal, whether the getting-started guide was dismissed, and anything on the
server (the server stores nothing about you; API keys and vector-store ids never reach the browser).

## Before anything is written

Choosing a file only *reads* it. The import page shows, per category, what is in the file and what **Merge** and
**Replace** would do. **Cancel** (or leaving the page) changes nothing. Invalid, truncated or newer-version files
are rejected as a whole; nothing is partially written. Files from older formats (versions 1 and 2) still import; for
categories they cannot contain (the session in progress) the page says what happens.

## Merge

Keeps everything from both sides. Conflict rules:

- Bookmarks / difficult marks: combined (a mark on either side stays).
- Notes and review results: for the same card, the one with the newer timestamp wins.
- Quiz attempts: combined (duplicates dropped, newest 50 per question kept).
- Chapters done: combined. Cards seen: the further point wins.
- Reading position per book: from whichever side studied that book most recently.
- Recent history and session summaries: combined.
- Preferences: this browser's choices are kept.
- Tutor conversations (only if the file has them): the most recent conversation per book stays open, all others go to
  Saved (max 10 per book).
- Session in progress: this browser's is kept; if there is none here, the file's is taken.
- Study sheets: combined; the same sheet on both sides: the copy edited most recently wins.
- Formula notebook: combined. The same formula on both sides (same card, or same custom formula id): the copy edited most recently wins.

## Replace

Every category **included in the file** replaces this browser's, even when the file's list is empty:

- Study data, history, summaries, preferences: replaced.
- Tutor conversations: if the file includes conversations (even zero), this browser's are replaced (an empty list
  removes them). If the file was exported without conversations, this browser's are kept.
- Study sheets: replaced by the file's (an empty list removes yours); files without sheets keep yours.
- Formula notebook: replaced by the file's (an empty list removes yours). Files from before format 3 have no formula data, so yours are kept.
- Session in progress: replaced by the file's; if the file says there is none (`null`), the session here ends. A
  version-1 file has no session data, so the session here is kept.

"First download a backup of this browser's current data" is checked by default; the backup is downloaded before
anything is written. Writes are journaled: if the tab closes mid-import, the next start restores the previous data.
