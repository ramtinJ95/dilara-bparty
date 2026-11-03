# Finale and end of the party

After the quiz has ended, the host opens the suspense page from the admin view and every phone moves there, while photo voting closes. The host then reveals the quiz winner and then the photo winner, one press each, and every phone celebrates at once. A tie for the most photo votes makes the host pick the winner before its reveal; a tie for first in the quiz shows joint winners together. At the end, the host ends the party, which refuses new guests, and wipes all data. At any time the host can instead reset the party, which keeps the questions and the landing photo.

## Sub-features

- `finale-suspense` shows `Och vinnarna är…` and `Håll i er, snart får vi veta!` on every phone, with no tabs. The contest card shows `Voting closed`.
- `finale-quiz` shows `Quizvinnaren` or `Quizvinnarna`, the names joined by `&`, the points, and `Grattis, du vann!` or `Grattis, du delar segern!` on a winner's phone.
- `finale-photo-tie` lists the tied photos in the finale card (`Tie for first, <n> votes each. Pick the winner.`) with `Pick as winner` buttons, and keeps `Reveal photo winner` disabled until one is picked. The host can pick on the suspense page or while the quiz winners show; the picker goes once the photo is revealed.
- `finale-photo` shows `Bästa fotot`, the winning photo, the photographer's name as a heading, `tog vinnarbilden · <n> röster`, `Grattis, det är din bild!` on the photographer's phone, and a `.recap` of the quiz winners (`Quizvinnaren` or `Quizvinnarna` and the names).
- `finale-reconnect` brings a phone that lost its socket back to the current finale step.
- `party-end` refuses new guests with `Kalaset är slut. Tack för att du var med!` and still lets an existing guest reclaim their name. `Reopen joins` undoes it.
- `party-wipe` deletes every player, photo, vote, question and answer after a confirmation that starts `Download the photos first!`. Every phone leaves for the bare page.
- `party-reset` clears the players, contest photos, votes, quiz answers and scores and the finale, and reopens joins, at any time after the host types `RESET`. Every phone leaves for the bare page. The questions, their photos and the landing photo stay, and the quiz is `Locked`.

## How to get to it (user POV)

- The host opens `/admin/$ADMIN_SECRET`. The `Finale` card, under the quiz card, has one button for the next step: `Open suspense page` (confirmed with `Yes, open suspense page`), `Reveal quiz winner` or `Reveal quiz winners`, then `Reveal photo winner`.
- The `End of the party` card at the bottom has `End the party` (confirmed with `Yes, end the party`), then `Reopen joins` and `Wipe all data…` (confirmed with `Yes, wipe everything`). `Reset party…` is there at any time: type `RESET` into `Type RESET to confirm`, then press `Yes, reset the party`.
- A guest does nothing. Their phone, on any tab, switches to the finale when the host opens it.

## Driving it with Playwright

Preconditions:

- The baseline from [README.md](./README.md), with phones on `/app`.
- An ended quiz: add a question, unlock, start, answer, reveal and press `End quiz` (see [quiz.md](./quiz.md)). The quiz card shows `Quiz ended`.
- For a photo winner, upload contest photos and vote (see [photo-contest.md](./photo-contest.md)). For a tie, give two photos the same number of votes.

- **Open the finale.** In the `.finale` card, press `Open suspense page`, then `Yes, open suspense page`. The card shows `Suspense page on phones`, and every phone shows the heading `Och vinnarna är…`. The contest card shows `Voting closed`, and the quiz card's buttons are disabled.
- **Reveal the quiz.** Press `Reveal quiz winner` or `Reveal quiz winners`. Every phone shows `Quizvinnaren` or `Quizvinnarna` and the names, and the card's first `.revealed` row names the same people.
- **Tie.** With a tie, the card shows the tied photos in `.tie-photos`. Press `Pick as winner` on one; it changes to `Winner ✓` and `Reveal photo winner` is enabled.
- **Reveal the photo.** Press `Reveal photo winner`. Every phone shows `Bästa fotot`, the photographer's name as a heading and the quiz recap, and the card's last `.revealed` row names the photographer.
- **Reconnect.** During a reveal, run `await line.cut("clean")` and `await line.restore()` (see [reconnect.md](./reconnect.md)). After `reconnecting(page)` goes away, the phone shows the same reveal.
- **End the party.** Press `End the party`, then `Yes, end the party`. The card shows `The party has ended. New guests can't join.` A new phone that joins by link sees `Kalaset är slut. Tack för att du var med!`.
- **Reclaim after the end.** On a phone that cleared its cookies, join with an existing name. `Är det du?` shows, and `Ja, det är jag` lands on the current finale step.
- **Reopen.** Press `Reopen joins`. The card shows `New guests can join.` End the party again before the wipe.
- **Reset.** Press `Reset party…`. `Yes, reset the party` stays disabled until the field holds exactly `RESET`. Press it. Every phone goes to `/`, the players card shows `Nobody has joined yet.`, the quiz card `Locked`, the finale card `Not started`, and the questions and the landing photo stay. The old join cookie shows the landing page again.
- **Wipe.** Press `Wipe all data…`. The warning starts `Download the photos first!` and has `Download all (zip, <n>)`. Press `Yes, wipe everything`. Every phone goes to `/`, and the players card shows `Players 0`.
- **Proof.** `evidence()` on a phone for the suspense page and each reveal, and on the laptop for the tie picker, the revealed card and the wipe confirmation.
- **At party scale.** `npm run rehearse` runs the finale with every phone, checks that only the winners are congratulated, lets a cookieless guest back in by name after the end, reopens and ends again, and wipes the party (`e2e/rehearsal/steps/finale.ts`).

## Gotchas

- The finale only goes forward. Once the suspense page is open, `Reset quiz` is refused, and the only ways back are `Reset party…`, which keeps the questions, and the wipe. A run that stopped mid-finale leaves the party there; end and wipe it before the next run.
- `Wipe all data…` shows only after `End the party`, and the server refuses a wipe before that. The wipe also reopens joins, because it deletes the setting.
- Winners are fixed at their reveal. Reopening voting or renaming a player afterwards doesn't change the photo or the quiz winner.
- A photo reveal with no gallery photos shows `Inga bilder var med den här gången`, and a quiz where nobody scored shows `Ingen fick poäng den här gången`.
- The reveal photo shows the cached thumbnail first and fades in the full photo when it loads, so check `.win-photo img.full.loaded` before a screenshot.
- Under the finale button, `End the quiz before you open the finale.` or `Photos are tied for first. Pick the winner before you reveal it.` says why it is disabled. The server refuses the step with the same text, from `FINALE_BLOCKERS` in `src/shared/finale.ts`.
- `End quiz` turns the fast heartbeat off, so a phone that drops silently during the finale may take up to 70 s to come back. A clean drop reconnects at once.
- A wiped phone leaves only when its `gone` message arrives. In the staging rehearsal of main 5c965d3 on WebKit, `Line` relayed the close before the delayed `gone`, so every shaped phone stayed on `/app`. `Line` now sends the close after the queued frames.
