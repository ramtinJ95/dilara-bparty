# Reconnect on bad networks

Guests are on mobile data. Every phone keeps a WebSocket to the party, reconnects on its own after losing it, and shows the current state when it comes back. The admin sees phones leave and return. In the quiz, this decides whether a phone sees a question in time.

## Sub-features

- `net-slow` joins and follows live changes on `slow-4g` (150 ms, 1600/750 kbps), `bad-3g` (400 ms, 400/200 kbps) and `flaky` (250 ms, 1000/500 kbps).
- `net-drop-clean` shows `Återansluter…`, then reconnects within about a second once the network is back, as when Chrome closes sockets on a network change.
- `net-drop-silent` recovers from a socket that goes quiet without closing, as in a tunnel. Only the phone notices: after 11 s without the server's tick with the fast heartbeat, after 70 s with the slow one. With the slow heartbeat, a tab change, a photo pick, the page becoming visible or the browser's `online` event sends one ping (at most every 15 s), and no reply within 5 s means reconnect. The admin view keeps showing the phone online until its connection fails.
- `net-heartbeat` is the admin header's `Fast heartbeat on` or `off`, with `Turn on` and `Turn off`. The server ticks every 4 s or 30 s. Unlocking the quiz turns it on, and `End quiz` or `Reset quiz` turns it off.
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
- **Silent drop, fast heartbeat.** Run `setFastHeartbeat(admin, true)` from `e2e/drive.ts`. Run `await line.cut("silent")`, rename, then `await line.restore()`. The admin keeps showing the phone online while the line is cut. The phone shows the new greeting about 11 s after the cut, once it has reconnected.
- **Silent drop, slow heartbeat.** Run `setFastHeartbeat(admin, false)`, cut silently and rename. While the line is cut, the phone keeps the old greeting past 11 s. After `restore()`, it shows the new one within about 5 s, because `restore()` fires the page's `online` event and the phone pings. `scripts/journeys/heartbeat.ts` runs both cases and prints the timings.
- **Freeze.** Run `await line.lifecycle!.freeze()`, rename, then `await line.lifecycle!.resume()`. The phone shows the new name at once. To model a phone that also lost its socket, run `line.cut("clean")`, wait for `reconnecting(page)`, then `freeze()`; run `line.restore()` before `resume()`. Cutting after the freeze leaves the server end open until the resume, because that end lives in the page.
- **Proof.** `evidence()` on the phone while the pill shows and after it catches up, and on the laptop while the dot is off.

## Gotchas

- `context.setOffline(true)` alone leaves an open WebSocket working in Chromium, and CDP throttling does not slow WebSocket frames. Use `Line`, which handles both.
- On Chromium, the CDP session that throttles must also send `offline`, or it overrides Playwright's offline flag. `Line.cut` does this.
- `lifecycle` is `null` on WebKit. There, a locked phone can only be modeled as a dropped one.
- Timings on a dev server are inflated, because it serves the client as many unbundled modules. Measure page loads against a build (`npm run test:e2e` serves one on port 4317) or staging.
- `e2e/network.spec.ts` runs these cases in `.nexus/check`. The rehearsal runs them for 20 phones at once with timings per profile.
- `Line.restore()` takes the context back online, which fires `online` in the page. So the harness can't show the 70 s wait after a restore; only a phone whose browser never saw the outage waits that long. Hold the line cut to observe the slow timeout.
- A fresh instance starts with the slow heartbeat. Check the admin header before a silent-drop timing; the quiz flips it on its own.
- `Line` relays a close through the same delayed pipe as the frames, so frames sent before a close, such as the wipe's `gone`, still arrive first. `test/phone-network.test.ts` holds that order.
