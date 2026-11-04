# Finale and end of the party

There are two finales, one per competition, and the host runs each on its own: the quiz finale right after the quiz, the photo finale whenever they like, usually hours later. Either can come first. Each has two presses in the admin view: open its suspense page, then reveal its winner, and every phone celebrates at once. The quiz finale needs an ended quiz and freezes it; the photo finale closes uploads and voting, and can't open while the quiz is running. Only one suspense page is on the phones at a time. After a reveal, each guest goes back to the party with a button, or on their own a minute after the reveal, and the app keeps the winners. At the end, the host ends the party, which refuses new guests, and wipes all data. At any time the host can instead reset the party, which keeps the questions and the landing photo and clears both finales.

## Sub-features

- `finale-quiz-suspense` shows `Vem vann quizet?` and `Håll i er, snart får vi veta!` on every phone, with no tabs. Uploads and voting stay open, and the quiz card's buttons are disabled.
- `finale-quiz` shows `Quizvinnaren` or `Quizvinnarna`, the names joined by `&`, the points, and `Grattis, du vann!` or `Grattis, du delar segern!` on a winner's phone.
- `finale-photo-suspense` shows `Vem tog bästa fotot?` and `Röstningen är stängd. Snart får vi veta!`. The contest card shows `Uploads closed` and `Voting closed`, and the quiz waits until the photo is revealed.
- `finale-photo-tie` lists the tied photos in the Photo finale card (`Tie for first, <n> votes each. Pick the winner.`) with `Pick as winner` buttons, and keeps `Reveal photo winner` disabled until one is picked. The host can pick at any time before the photo reveal; the picker goes once the photo is revealed.
- `finale-photo` shows `Bästa fotot`, the winning photo, the photographer's name as a heading, `tog vinnarbilden · <n> röster` and `Grattis, det är din bild!` on the photographer's phone. Once the quiz winners are out, it also shows a `.recap` of them (`Quizvinnaren` or `Quizvinnarna` and the names).
- `finale-back` ends each reveal with `Tillbaka till festen`, which takes that phone back to the app. A minute after the reveal (`REVEAL_SHOW_MS` in `src/shared/finale.ts`), the server sends every phone back. The Quiz tab then shows the quiz winners in `.quiz-winners`, with the congratulation on a winner's phone, and the gallery opens with `.photo-winner` (`Bästa fotot`, the photographer, the votes).
- `finale-reconnect` brings a phone that joins or reconnects to the current step: the suspense page, the reveal for the rest of its minute, or the app.
- `party-end` refuses new guests with `Kalaset är slut. Tack för att du var med!` and still lets an existing guest reclaim their name. `Reopen joins` undoes it.
- `party-wipe` deletes every player, photo, vote, question and answer after a confirmation that starts `Download the photos first!`. Every phone leaves for the bare page.
- `party-reset` clears the players, contest photos, votes, quiz answers and scores and both finales, and reopens joins, at any time after the host types `RESET`. Every phone leaves for the bare page. The questions, their photos and the landing photo stay, and the quiz is `Locked`.

## How to get to it (user POV)

- The host opens `/admin/$ADMIN_SECRET`. Under the quiz card, the `Quiz finale` card (`.quiz-finale`) and the `Photo finale` card (`.photo-finale`) each have one button for the next step: `Open suspense page` (confirmed with `Yes, open suspense page`), then `Reveal quiz winner` or `Reveal quiz winners`, or `Reveal photo winner`. Each card's badge reads `Not started`, `Suspense page on phones`, `Winner on phones` or `Revealed`.
- The `End of the party` card at the bottom has `End the party` (confirmed with `Yes, end the party`), then `Reopen joins` and `Wipe all data…` (confirmed with `Yes, wipe everything`). `Reset party…` is there at any time: type `RESET` into `Type RESET to confirm`, then press `Yes, reset the party`.
- A guest does nothing until a reveal: their phone, on any tab, switches to the suspense page when the host opens it. On a reveal they can press `Tillbaka till festen`.

## Driving it with Playwright

Preconditions:

- The baseline from [README.md](./README.md), with phones on `/app`.
- For the quiz finale, an ended quiz: add a question, unlock, start, answer, reveal and press `End quiz` (see [quiz.md](./quiz.md)). The quiz card shows `Quiz ended`.
- For a photo winner, upload contest photos and vote (see [photo-contest.md](./photo-contest.md)). For a tie, give two photos the same number of votes. The photo finale needs a quiz that is `Locked` or `Quiz ended`.

- **Open a suspense page.** In `.quiz-finale` or `.photo-finale`, press `Open suspense page`, then `Yes, open suspense page`. The card shows `Suspense page on phones`, every phone shows the heading `Vem vann quizet?` or `Vem tog bästa fotot?`, and the header shows `Fast heartbeat on`. The other card's button is disabled with `The quiz finale is on the phones. Reveal it first.` or `The photo finale is on the phones. Reveal it first.`
- **Reveal the quiz.** Press `Reveal quiz winner` or `Reveal quiz winners`. Every phone shows `Quizvinnaren` or `Quizvinnarna` and the names, and the card's `.revealed` row names the same people.
- **Tie.** With a tie, the photo card shows the tied photos in `.tie-photos`. Press `Pick as winner` on one; it changes to `Winner ✓` and `Reveal photo winner` is enabled.
- **Reveal the photo.** Press `Reveal photo winner`. Every phone shows `Bästa fotot` and the photographer's name as a heading, and the card's `.revealed` row names the photographer.
- **Back to the party.** On a phone, press `Tillbaka till festen`. The greeting and the tabs come back; the Quiz tab shows `.quiz-winners` and the gallery `.photo-winner`. A phone left alone goes back about a minute after the reveal, and the card's badge turns `Revealed`.
- **Reconnect.** During a reveal, run `await line.cut("clean")` and `await line.restore()` (see [reconnect.md](./reconnect.md)). After `reconnecting(page)` goes away, the phone shows the same reveal.
- **End the party.** Press `End the party`, then `Yes, end the party`. The card shows `The party has ended. New guests can't join.` A new phone that joins by link sees `Kalaset är slut. Tack för att du var med!`.
- **Reclaim after the end.** On a phone that cleared its cookies, join with an existing name. `Är det du?` shows, and `Ja, det är jag` lands on the current step: a reveal still in its minute, or the app.
- **Reopen.** Press `Reopen joins`. The card shows `New guests can join.` End the party again before the wipe.
- **Reset.** Press `Reset party…`. `Yes, reset the party` stays disabled until the field holds exactly `RESET`. Press it. Every phone goes to `/`, the players card shows `Nobody has joined yet.`, the quiz card `Locked`, both finale cards `Not started`, and the questions and the landing photo stay. The old join cookie shows the landing page again.
- **Wipe.** Press `Wipe all data…`. The warning starts `Download the photos first!` and has `Download all (zip, <n>)`. Press `Yes, wipe everything`. Every phone goes to `/`, and the players card shows `Players 0`.
- **Proof.** `evidence()` on a phone for each suspense page, each reveal and the winners in the app, and on the laptop for the tie picker, the revealed cards and the wipe confirmation.
- **At party scale.** `npm run rehearse` runs the quiz finale and then the photo finale with every phone, checks that only the winners are congratulated, sends every phone back with its button, lets a cookieless guest back in by name after the end, reopens and ends again, and wipes the party (`e2e/rehearsal/steps/finale.ts`). `e2e/admin.spec.ts` runs the photo finale before the quiz, and waits for a phone to go back on its own. Its last two tests run both orders with the two reveals' minutes overlapping, and check that Back from the later reveal goes to the party, also after a reload.

## Gotchas

- Each finale only goes forward. Once the quiz finale's suspense page is open, `Reset quiz` is refused, and the only ways back are `Reset party…`, which keeps the questions, and the wipe. A run that stopped mid-finale leaves the party there; end and wipe it before the next run.
- While the photo finale's suspense page is on, every quiz button is refused with `The photo finale is on the phones.`
- `Wipe all data…` shows only after `End the party`, and the server refuses a wipe before that. The wipe also reopens joins, because it deletes the setting.
- Winners are fixed at their reveal. Reopening voting or renaming a player afterwards doesn't change the photo or the quiz winner, but a rename shows under the new name.
- A photo reveal with no gallery photos shows `Inga bilder var med den här gången`, and a quiz where nobody scored shows `Ingen fick poäng den här gången`.
- The reveal photo shows the cached thumbnail first and fades in the full photo when it loads, so check `.win-photo img.full.loaded` before a screenshot.
- Under each finale button, the reason it is disabled shows, such as `End the quiz before you open the quiz finale.`, `The quiz is running. End it before you open the photo finale.` or `Photos are tied for first. Pick the winner before you reveal it.` The server refuses the step with the same text, from `FINALE_BLOCKERS` in `src/shared/finale.ts`.
- `Tillbaka till festen` leaves that reveal and every earlier one, and the phone remembers it in `localStorage` (`reveal-left`, the reveal's server time `at`), so neither comes back after a reload. Only a later reveal covers the app again. A phone that never pressed it and reloads during the reveal's minute shows the reveal again.
- The fast heartbeat runs from a suspense page until its reveal's minute is over, unless the quiz is running then. A phone that drops silently after that may take up to 70 s to come back. A clean drop reconnects at once.
- A wiped phone leaves only when its `gone` message arrives. In the staging rehearsal of main 5c965d3 on WebKit, `Line` relayed the close before the delayed `gone`, so every shaped phone stayed on `/app`. `Line` now sends the close after the queued frames.
