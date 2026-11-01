# Finale and end of the party

After the quiz has ended, the host opens the suspense page from the admin view and every phone moves there, while photo voting closes. The host then reveals the photo winner and the quiz winner, one press each, and every phone celebrates at once. A tie for the most photo votes makes the host pick the winner first; a tie for first in the quiz shows joint winners together. At the end, the host ends the party, which refuses new guests, and wipes all data.

## Sub-features

- `finale-suspense` shows `Och vinnarna är…` and `Håll i er, snart får vi veta!` on every phone, with no tabs. The contest card shows `Voting closed`.
- `finale-photo` shows `Bästa fotot`, the winning photo, the photographer's name as a heading, `tog vinnarbilden · <n> röster`, and `Grattis, det är din bild!` on the photographer's phone.
- `finale-photo-tie` lists the tied photos in the finale card (`Tie for first, <n> votes each. Pick the winner.`) with `Pick as winner` buttons, and keeps `Reveal photo winner` disabled until one is picked.
- `finale-quiz` shows `Quizvinnaren` or `Quizvinnarna`, the names joined by `&`, the points, `Grattis, du vann!` or `Grattis, du delar segern!` on a winner's phone, and a `Bästa fotot` recap.
- `finale-reconnect` brings a phone that lost its socket back to the current finale step.
- `party-end` refuses new guests with `Kalaset är slut. Tack för att du var med!` and still lets an existing guest reclaim their name. `Reopen joins` undoes it.
- `party-wipe` deletes every player, photo, vote, question and answer after a confirmation that starts `Download the photos first!`. Every phone leaves for the bare page.

## How to get to it (user POV)

- The host opens `/admin/$ADMIN_SECRET`. The `Finale` card, under the quiz card, has one button for the next step: `Open suspense page` (confirmed with `Yes, open suspense page`), `Reveal photo winner`, then `Reveal quiz winner` or `Reveal quiz winners`.
- The `End of the party` card at the bottom has `End the party` (confirmed with `Yes, end the party`), then `Reopen joins` and `Wipe all data…` (confirmed with `Yes, wipe everything`).
- A guest does nothing. Their phone, on any tab, switches to the finale when the host opens it.

## Driving it with Playwright

Preconditions:

- The baseline from [README.md](./README.md), with phones on `/app`.
- An ended quiz: add a question, unlock, start, answer, reveal and press `End quiz` (see [quiz.md](./quiz.md)). The quiz card shows `Quiz ended`.
- For a photo winner, upload contest photos and vote (see [photo-contest.md](./photo-contest.md)). For a tie, give two photos the same number of votes.

- **Open the finale.** In the `.finale` card, press `Open suspense page`, then `Yes, open suspense page`. The card shows `Suspense page on phones`, and every phone shows the heading `Och vinnarna är…`. The contest card shows `Voting closed`, and the quiz card's buttons are disabled.
- **Tie.** With a tie, the card shows the tied photos in `.tie-photos`. Press `Pick as winner` on one; it changes to `Winner ✓` and `Reveal photo winner` is enabled.
- **Reveal the photo.** Press `Reveal photo winner`. Every phone shows `Bästa fotot` and the photographer's name as a heading, and the card's `.revealed` row names the same person.
- **Reveal the quiz.** Press `Reveal quiz winner` or `Reveal quiz winners`. Every phone shows `Quizvinnaren` or `Quizvinnarna` and the names.
- **Reconnect.** During a reveal, run `await line.cut("clean")` and `await line.restore()` (see [reconnect.md](./reconnect.md)). After `reconnecting(page)` goes away, the phone shows the same reveal.
- **End the party.** Press `End the party`, then `Yes, end the party`. The card shows `The party has ended. New guests can't join.` A new phone that joins by link sees `Kalaset är slut. Tack för att du var med!`.
- **Wipe.** Press `Wipe all data…`. The warning starts `Download the photos first!` and has `Download all (zip, <n>)`. Press `Yes, wipe everything`. Every phone goes to `/`, and the players card shows `Players 0`.
- **Proof.** `evidence()` on a phone for the suspense page and each reveal, and on the laptop for the tie picker, the revealed card and the wipe confirmation.
- **At party scale.** `npm run rehearse` runs the finale with every phone and wipes the party at the end (`e2e/rehearsal/steps/finale.ts`).

## Gotchas

- The finale only goes forward. Once the suspense page is open, `Reset quiz` is refused, and the only way back to an empty party is the wipe. A run that stopped mid-finale leaves the party there; end and wipe it before the next run.
- `Wipe all data…` shows only after `End the party`, and the server refuses a wipe before that. The wipe also reopens joins, because it deletes the setting.
- Winners are fixed at their reveal. Reopening voting or renaming a player afterwards doesn't change the photo or the quiz winner.
- A photo reveal with no gallery photos shows `Inga bilder var med den här gången`, and a quiz where nobody scored shows `Ingen fick poäng den här gången`.
- The reveal photo shows the cached thumbnail first and fades in the full photo when it loads, so check `.win-photo img.full.loaded` before a screenshot.
