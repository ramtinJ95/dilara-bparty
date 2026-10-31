# Live quiz

The host writes questions in the admin view, unlocks the quiz, and runs it one question at a time. Every phone with the app open gets a popup when the quiz unlocks, then shows each question with a countdown set by the server, takes one final answer, and shows whether it was right, how the room answered and the leaderboard. A guest who joins late or reconnects plays from the current question with their answer and score intact. The guest UI is Swedish, the admin view English.

## Sub-features

- `quiz-editor` adds, edits, reorders and deletes multiple-choice questions (2 to 4 options, optional photo) and closest-number questions, each with 5 to 120 seconds.
- `quiz-unlock-popup` shows the dialog `Quizet har börjat!` with `Till quizet` and `Inte nu` on every phone that is not on the Quiz tab, once per unlock. A phone on the Quiz tab shows `Quizet börjar snart!` instead.
- `quiz-question` shows `Fråga <n> av <total>`, the photo, the question, the options or a `Din gissning` field, and a countdown, on every phone at once.
- `quiz-answer-timing` takes one answer per phone (`Svar skickat!`). The server accepts answers until the deadline plus 2 s and clamps the phone's reported time; speed points fall from 1000 to 500.
- `quiz-close` closes answers as soon as every online guest has answered, else at the deadline plus grace. Phones show `Väntar på rätt svar …` and the guest's own answer, or `Du hann inte svara den här gången.`
- `quiz-reveal` shows `Rätt!`, `Tyvärr fel`, `Närmast!`, `Inte närmast den här gången` or `Inget svar`, `+<n> poäng`, `Totalt <n> poäng` and `Så svarade alla`.
- `quiz-leaderboard` shows `Topplistan` with the top five, the guest's own row tagged `Du`, and a separate `Din plats` row for a guest outside the top five.
- `quiz-late-join` lets a guest who joins mid-quiz play from the current question.
- `quiz-reconnect` brings a phone that lost its socket back to the current question with its pick and score.
- `quiz-end` shows `Quizet är slut!` on phones and `Winner: <name>` or `Joint winners: <a> & <b>` in the admin view. `Reset quiz` wipes answers and scores and keeps the questions.

## How to get to it (user POV)

- The host opens `/admin/$ADMIN_SECRET` and uses the `Questions` card (`+ Multiple choice`, `+ Closest number`) and the `Quiz` card's buttons: `Unlock quiz`, `Start question 1` (later `Next question`), `Reveal answer`, `Show leaderboard`, `End quiz` and `Reset quiz`.
- A guest is in the app on `/app`. The Quiz tab is the default tab. From `Mitt foto` or `Galleri`, the guest gets there through the unlock popup or the `Quiz` tab button, which shows a dot (`En fråga väntar`) while an unanswered question is open.
- A guest who joins or reopens the app mid-quiz lands on the current quiz screen.

## Driving it with Playwright

Preconditions:

- The baseline from [README.md](./README.md): a laptop page `admin` on the admin view, and phones joined with `joinByLink` from `e2e/drive.ts`, each on `/app`.
- The quiz card shows `Locked` and the questions card shows `No questions yet. Add the first one below.` A fresh instance starts that way. Otherwise press `Reset quiz`, then `Yes, reset quiz`, and delete each question.
- Placeholder content only, such as `Hur många snöbollar ryms i en hink?`. For a photo, generate one with `placeholder(admin, LOOKS.snow)` from `e2e/placeholder.ts`.

- **Write questions.** Run `await addQuestion(admin, { kind: "choice", text, options: ["Sex armar", "Fyra armar"], correct: 0, seconds: 30, photo })` and `await addQuestion(admin, { kind: "number", text, answer: "7" })` from `e2e/drive.ts`. Each appears in `.questions > ol > li` with `Multiple choice` or `Closest number` and `<n> s`, and the quiz card says `Up next: question 1, “<text>”`.
- **Editor validation.** Open `+ Multiple choice`, fill `Question` and leave an option empty. `Save question` is disabled and the form shows `Fill in every option.` Other messages are `Write the question.`, `Mark the correct option.` and `Time must be 5 to 120 seconds.`
- **Unlock.** Put one phone on `Galleri` and leave one on `Quiz`. Press `Unlock quiz`. The quiz card shows `Unlocked, waiting for the first question`. The Galleri phone shows `unlockPopup(page)` from `e2e/drive.ts`. Tap `Till quizet`: the dialog closes, the `Quiz` tab has `aria-current="page"`, and `Quizet börjar snart!` shows. The Quiz phone shows `Quizet börjar snart!` and no dialog.
- **Popup once.** On the phone that tapped the popup, switch to `Galleri` and reload. No dialog shows. `Inte nu` also marks it seen.
- **Start a question.** Press `Start question 1`. The quiz card shows `Question open` and `0 of <online> answered`. Each phone shows `Fråga 1 av 2`, the photo (`.q-photo`, `naturalWidth > 0`), the question as a heading and `.choices`. While the photo loads, the phone shows `Laddar frågan …` instead.
- **Answer.** Run `await answer(page, "Sex armar")` from `e2e/drive.ts`. The phone shows `Svar skickat!`, the option has class `picked`, every option is disabled, and the admin shows `1 of <online> answered`. On a closest-number question, `answer` fills `Din gissning` and presses `Skicka`, and the phone shows `Din gissning: <n>`.
- **Close early.** Answer on every online phone. The quiz card shows `Answers closed` before the countdown ends. Each phone shows `Väntar på rätt svar …` and `Ditt svar: A. Sex armar`.
- **Close at the deadline.** Leave one phone unanswered. At zero it shows `Tiden är ute!`. About 2 s later the quiz card shows `Answers closed` and that phone shows `Du hann inte svara den här gången.`
- **Reveal.** Press `Reveal answer`. The quiz card shows `Answer revealed` with a bar per option and the correct one marked `✓`, or `Answer <n>` and `Closest: <name> (<guess>)`. A right phone shows the heading `Rätt!` and `+<500 to 1000> poäng`, a wrong one `Tyvärr fel` and `+0 poäng`, an unanswered one `Inget svar`. Closest-number phones show `Närmast!` or `Inte närmast den här gången`.
- **Leaderboard.** Press `Show leaderboard`. Each phone shows the heading `Topplistan`, `Efter fråga 1 av 2`, at most five rows in `.lb`, and its own row `.lb .row.you` with the guest's name and `Du`. Its rank and score match the admin's `ol.board` row for that name (the admin writes `1,000`, the phone `1 000`).
- **Played questions.** The first question's row shows `Played`, and its `Edit` and `Delete` buttons are disabled.
- **Reconnect.** With a question open, answer, then run `await line.cut("clean")` and `await line.restore()` (see [reconnect.md](./reconnect.md)). After `reconnecting(page)` goes away, the phone is back on the open question with its pick and `Svar skickat!`.
- **Late join.** With a question open, join a new phone. It lands on the open question and can answer, and the admin's `of <n> answered` grows by one.
- **End.** After the last reveal or leaderboard, press `End quiz` (with questions left it asks `End the quiz now? …` first). The quiz card shows `Quiz ended` and `Winner: <name>` or `Joint winners: …`. Each phone shows `Quizet är slut!`.
- **Reset.** Press `Reset quiz`, then `Yes, reset quiz`. The quiz card shows `Locked`, the questions stay, and phones show `Quizet är inte öppet än`.
- **Proof.** `evidence()` on a phone for the popup, the open question, the answered state, the reveal and the leaderboard, and on the laptop for the tally and the result.
- **At party scale.** `npm run rehearse` plays both question types with 20 phones (`e2e/rehearsal/steps/quiz.ts`) and times the popup, the question and the reveal per network profile.

## Gotchas

- The server owns the clock. Phones count down to the server's deadline, and the server accepts answers until 2 s after it (`GRACE_MS`). A check for `Tiden är ute!` has only those 2 s before the phone moves on to the closed screen.
- A question waits for its photo. Until the photo has loaded, the phone shows `Laddar frågan …` and no options, and the answer timer has not started. `/photos/<id>` answers 404 to a guest until that question has started in the current run, and again after a reset, so phones fetch the photo only when the question opens. The admin can fetch every photo.
- `Svar skickat!` shows once the server has the answer. Until then the phone shows `Skickar svaret …`, keeps the pick, and sends it again after a reconnect, so a line that drops right after the tap still ends with the pick kept.
- Answers are final. The server keeps the first answer and ignores later ones, and the phone disables the options after a pick.
- The popup's seen state is in `localStorage` under `quiz-unlock-seen`, keyed by the unlock time. Clearing cookies keeps it, and a new browser context starts without it. After `Reset quiz` and a new unlock, every phone gets the popup again.
- Answers close early only when every online guest has answered. Other phones on the same instance, such as a forgotten tab, count, so the round then runs to its deadline. Close stray contexts first.
- A question cannot be edited or deleted once played, until `Reset quiz`. Reset keeps the questions and wipes every answer and score.
- On the Quiz tab, once the quiz is unlocked, the header is compact and hides `<n> gäster här just nu`. A presence check that reads the count must move the phone to `Galleri` first, and an instance whose quiz is not locked fails the rehearsal's join step. The rehearsal resets the quiz when it ends.
- Admin numbers use `en-GB` (`1,000`) and phones `sv-SE` (`1 000`, with a no-break space). Compare digits only.
