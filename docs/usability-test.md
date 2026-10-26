# LearnScroll moderated usability test

Five short tasks, one participant at a time, about 30 minutes. A facilitator runs the session and writes on
the observation sheet. **Nothing is recorded or sent by the app** (there is no telemetry); the paper sheet is the
only record.

## Before the session (facilitator checklist)

- [ ] Use a laptop browser profile **without** your own study data, or be ready to type `RESET` (see below).
- [ ] Open `https://learn.jargal.me/?usability=1#/usability` (the test kit; it's hidden without `?usability=1`).
- [ ] If the kit says **“This browser has real study data”**: setting up a scenario first downloads a backup file
      (`learnscroll-study-…-before-usability-test.json`) and keeps a copy in this browser. You must type `RESET`
      to continue. **Restore my real data** at the end brings it back exactly.
- [ ] Check the yellow **Test profile** bar is visible at the top of every page (sample data is labeled `[Sample]`).
- [ ] Scenario C uses the live tutor (one question = one tutor call). Check the tutor panel says “Tutor connected”.
- [ ] Have a timer and one printed observation sheet per scenario.
- [ ] Read the participant the intro: “We're testing the site, not you. Think aloud. I can't help during a task.”

Set up each scenario with its **Set up** button just before the task, then hand over the laptop.

## Scenarios

| | Task read to the participant | Start state (kit button) | Completed when |
|---|---|---|---|
| **A** | “Open ‘Conduction: Fourier’s law’ in Heat and Mass Transfer, Chapter 1.” | **Set up A**: clean profile, library page, first-use guide visible. | Reader shows Ch 1, card 13 “Conduction: Fourier’s law”. |
| **B** | “Continue where you left off, mark the card you land on as difficult, then find it again from the book’s Difficult filter.” | **Set up B**: sample profile, Heat and Mass Transfer Ch 1 in progress at card 13; “Continue studying” on the library page. | Card 13 is in the book’s Difficult list and opens from there. |
| **C** | “Ask the tutor what each symbol in Fourier’s law means and its units, then tell me where the answer came from.” | **Set up C**: sample profile, reader open at Ch 1 card 13. | Participant identifies Q̇_cond (heat rate, W), k (thermal conductivity, W/m·K), A (area, m²), dT/dx (temperature gradient, K/m) and points to the “From the textbook” part / Sources. |
| **D** | “Do the practice questions, then go back to the one you got wrong, read why, and try it again.” | **Set up D**: sample profile, practice question 1 already answered wrong once; reader at the first practice question. | The previously wrong question is retried and answered correctly (Review mistakes shows it correct). |
| **E** | “Save a backup of your study data. … Now bring it back and check your note is there.” | **Set up E**: sample profile with a bookmark and the note “[Sample] Test note for the usability session.” on Ch 1 card 2. After the participant exports, the facilitator clicks **Clean profile**, then hands back. | After import, Ch 1 card 2 shows the sample note and bookmark. |

Stop a task after 5 minutes or if the participant asks for help (record it as “blocked”, or “not without help”).

## After the session

- [ ] Click **Restore my real data** (or **Clean profile** if the browser had none). The Test profile bar disappears.
- [ ] Delete downloaded test files from the Downloads folder (keep the `before-usability-test` backup until you've
      checked your real data is back).

## Observation sheet (one per scenario)

Participant: ______  Date: ______  Device / browser: ______  Scenario: A B C D E (circle)

| Item | Record |
|---|---|
| Completed without help? | ☐ Yes ☐ No |
| Time to complete (mm:ss) | ______ |
| Wrong turns (count, and where) | ______________________________ |
| Confusing labels or words (quote them) | ______________________________ |
| Severity of the worst problem | ☐ Minor (noticed, no delay) ☐ Slowed (delayed, recovered alone) ☐ Blocked (could not finish without help) |
| Quotes / notes | ______________________________ |

## Summary table (fill in after all sessions)

| Scenario | Participants | Completed without help | Median time | Most common wrong turn | Worst severity |
|---|---|---|---|---|---|
| A | | | | | |
| B | | | | | |
| C | | | | | |
| D | | | | | |
| E | | | | | |
