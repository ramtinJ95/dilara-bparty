# Stay signed in

A guest joins once per phone. If Safari later loads the app without the `pid` cookie, the phone signs itself back in from the copy of its signed identity that `/app` saved in `localStorage`, and lands on `/app` without the join code. A joined phone that opens `/` or the join link goes straight to `/app`. A Reset party or a wipe deletes the player and the copy, so the phone goes to `/` and stays there.

## Sub-features

- `stay-root` sends a phone with a valid cookie for an existing player from `/` to `/app`.
- `stay-copy` stores the signed identity (`<player id>.<signature>`, never the join secret) in `localStorage` under `pid` each time `/app` loads.
- `stay-restore` signs a phone without a valid cookie back in from its copy, from `/`, `/app` (which redirects to `/`) or the join link, through `POST /api/restore`.
- `stay-refused` forgets a copy the server refuses (tampered, or a player a reset or a wipe deleted), and the code form shows.
- `stay-ended` restores a guest who joined before the host ended the party.
- `stay-open` restores the cookie of a page that stayed open, on the first refused reconnect, so the `Återansluter…` pill clears without a reload. A refused copy sends that page to `/`.
- `stay-stalled` gives up on a restore after 8 s, shows the page and keeps the copy.

## How to get to it (user POV)

- Join on a phone, then lose the cookie: Safari drops it, or the guest clears cookies but not website data. Open the app, `/` or the join link again.

## Driving it with Playwright

Preconditions:

- A phone `page` that joined with `joinByLink` as `Testgäst <tag>` and shows `greeting(page, name)`.

- **Copy.** Run `await page.evaluate(() => localStorage.getItem("pid"))`. It matches `/^[\w-]+\.[\w-]+$/` and doesn't contain `$JOIN_SECRET`.
- **Restore.** Run `await page.context().clearCookies()` and `await page.goto("/app")`. The URL ends in `/app` and `greeting(page, name)` shows. The context has a `pid` cookie again. Repeat with `/` and `/j/$JOIN_SECRET`.
- **Open page.** On a phone from `phone("good")`, run `clearCookies()`, `line.cut("clean")` and `line.restore()`. `reconnecting(page)` goes away, the admin shows the guest online, and the context has a `pid` cookie again.
- **Root.** With the cookie, run `await page.goto("/")`. The URL ends in `/app`.
- **Reset.** Reset the party from the admin view. The phone goes to `/`, `localStorage.getItem("pid")` is `null`, and after `page.reload()` the `Kod` field shows.
- **Refused.** After the reset, put the old copy back with `localStorage.setItem("pid", saved)` and reload. The `Kod` field shows, and the copy is gone.
- **Proof.** `e2e/smoke.spec.ts` (`a phone that lost its cookie comes back…`, `a restore that never answers…`), `e2e/network.spec.ts` (`a phone whose cookie went while the app stayed open…`) and the reset test in `e2e/admin.spec.ts` run these in Chromium and WebKit. `scripts/journeys/stay-signed-in.ts` runs the restore and the reset against any instance.

## Gotchas

- To simulate a phone that lost its whole identity, as on another browser, use `forgetIdentity(page)`. `clearCookies()` alone gets restored.
- The code form is hidden while a restore runs, so a slow restore shows an empty page for up to 8 s.
- Cookies are scoped to the host, not the port, so two instances on `127.0.0.1` (or two Nexus previews on one `ts.net` name) overwrite each other's `pid` cookie. `localStorage` is per port, so each restores its own on the next load or reconnect.
