# Reconnect on bad networks

Guests are on mobile data. Every phone keeps a WebSocket to the party, reconnects on its own after losing it, and shows the current state when it comes back. The admin sees phones leave and return. In the quiz, this decides whether a phone sees a question in time.

## Sub-features

- `net-slow` joins and follows live changes on `slow-4g` and `bad-3g` (400 ms, 400 kbps).
- `net-drop-clean` shows `Återansluter…`, then reconnects within about a second once the network is back, as when Chrome closes sockets on a network change.
- `net-drop-silent` recovers from a socket that goes quiet without closing, as in a tunnel. Only the 40 s heartbeat notices, so recovery takes up to about 40 s.
- `net-freeze` catches up after a background tab is frozen and resumed, with or without losing its socket.
- `net-admin` shows a cleanly dropped or locked phone as offline, and online again after it returns.

## How to get to it (user POV)

- A guest walks out of signal, locks the phone, switches apps, or sits on weak 3G at the venue.

## Driving it with Playwright

Preconditions:

- A laptop page on the admin view.
- A phone from `phone("slow-4g")` or another profile, so it has a `line`, joined as `Testgäst <tag>`.

- **Slow network.** On `phone("bad-3g")`, join and then rename from the admin. The phone shows the new greeting within a few seconds, and a reload brings back the same state.
- **Clean drop.** Run `await line.cut("clean")`. The phone shows `reconnecting(page)`, and `onlineDot(admin, name)` disappears. Rename the player from the admin; the phone keeps the old greeting. Run `await line.restore()`. The phone shows the new greeting, the pill goes away, and the dot comes back.
- **Silent drop.** Run `await line.cut("silent")`, rename, wait, then `await line.restore()`. The admin keeps showing the phone online throughout. Give the phone up to 60 s to show the new greeting.
- **Freeze.** Run `await line.lifecycle!.freeze()`, rename, then `await line.lifecycle!.resume()`. The phone shows the new name at once. To model a phone that also lost its socket, run `line.cut("clean")`, wait for `reconnecting(page)`, then `freeze()`; run `line.restore()` before `resume()`. Cutting after the freeze leaves the server end open until the resume, because that end lives in the page.
- **Proof.** `evidence()` on the phone while the pill shows and after it catches up, and on the laptop while the dot is off.

## Gotchas

- `context.setOffline(true)` alone leaves an open WebSocket working in Chromium, and CDP throttling does not slow WebSocket frames. Use `Line`, which handles both.
- On Chromium, the CDP session that throttles must also send `offline`, or it overrides Playwright's offline flag. `Line.cut` does this.
- `lifecycle` is `null` on WebKit. There, a locked phone can only be modeled as a dropped one.
- Timings on a dev server are inflated, because it serves the client as many unbundled modules. Measure page loads against a build (`npm run test:e2e` serves one on port 4317) or staging.
- `e2e/network.spec.ts` runs these cases in `.nexus/check`. The rehearsal runs them for 20 phones at once with timings per profile.
