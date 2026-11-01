---
name: verify-dilara-bparty
description: Drive the dilara-bparty party app (guest phones and the admin laptop) in a real browser to prove a behaviour, with screenshots and ARIA snapshots as evidence. Covers launching an isolated dev server, phones on bad mobile networks, the Playwright network tests, the 20-phone party rehearsal and the staging deployment. Use it before claiming a guest or admin feature works, when adding a feature to the verification map, or when rehearsing against staging.
---

# Verify dilara-bparty

The app is a party quiz and photo contest. Guests use their own phones (Swedish UI). The host runs an admin view on a laptop (English UI). Everything a user can see happens in a browser. This skill drives that browser with Playwright and saves what it saw.

Read [features/README.md](features/README.md) before driving anything. It lists every user-facing feature and links one recipe per feature.

## Launch

Start your own instance. It runs `vite dev` with the Worker and the Durable Object under miniflare, keeps state in memory, and reads the secrets from `.dev.vars`.

```sh
node .claude/skills/verify-dilara-bparty/scripts/instance.ts start
# BASE_URL=http://127.0.0.1:<port>
```

- It is ready when it prints `BASE_URL`. The script waits until `/j/<JOIN_SECRET>` answers 200, which needs the Worker, the Durable Object and its migrations.
- `.dev.vars` must exist. On a pylon, `.nexus/resume` creates it. Elsewhere, copy `.dev.vars.example` and fill both values.
- Each instance starts empty, so the party has no players and no landing photo.
- Several instances can run side by side on different ports.

The project also runs the `web` service from `.nexus/services.yaml` (`nexus services ensure --json` prints its port and preview URL). That is the person's preview, and its state persists in `.wrangler/state`. Don't drive mutations there: players you create stay in their admin list.

## Doctor

Run this first, and again whenever something looks off. It only reads.

```sh
node .claude/skills/verify-dilara-bparty/scripts/instance.ts doctor "$BASE_URL"
```

It checks the following: the neutral page answers with `X-Robots-Tag: noindex`, `JOIN_SECRET` opens the join page, `ADMIN_SECRET` gives the admin cookie, Chromium exists for Playwright, and ffmpeg exists. It also says whether this script started the instance, and whether the target is a Vite dev server or a built Worker. Any `FAIL` line means stop and fix that first. A 404 on the join page almost always means the secrets in your environment belong to another instance.

## Drive

The harness is Playwright as a library, run with `node` (Node 22.18 or later strips the types). Use these building blocks instead of writing your own:

- `scripts/verify.ts` exports `openVerify(baseUrl, evidenceDir)`. It returns `phone(profile?)` at 390x844, `laptop()` at 1440x900, `evidence(page, name)` and `close()`. It launches Debian's `/usr/bin/chromium` when Playwright's own Chromium is missing, as on the pylon.
- `e2e/drive.ts` has the stable handles: `openAdmin`, `joinByLink`, `joinByCode`, `renameFromAdmin`, `greeting`, `onlineDot`, `adminRow`, `reconnecting`, `guestsHere`, and for the quiz `addQuestion`, `fillQuestion`, `answer` and `unlockPopup`.
- `e2e/phone-network.ts` puts a phone on a network profile: `good`, `slow-4g`, `bad-3g` (400 ms, 400 kbps) or `flaky`. The returned `Line` can `cut("clean" | "silent")`, `restore()`, and, on Chromium, `lifecycle.freeze()` and `resume()`.

A journey is a short script in `scripts/journeys/`. `join-by-link.ts` is the reference one. Copy it for a new journey:

```sh
node .claude/skills/verify-dilara-bparty/scripts/journeys/join-by-link.ts "$BASE_URL"
# PASS join-by-link: "Testgäst k3f9" joined, the admin saw them live, and the cookie held. Evidence: …
```

Network facts to know before you write a network journey. They were measured in Chromium 156 and are explained in `e2e/phone-network.ts`:

- CDP network emulation slows HTTP but not WebSocket frames. `shapeNetwork` adds the latency to the party socket itself.
- `setOffline` does not close an open WebSocket. Only `Line.cut` ends the live connection.
- A frozen page keeps its socket, so the server still counts it online.
- A silent outage (`cut("silent")`) is noticed only by the phone's 40 s heartbeat. Expect up to about 40 s before the phone catches up.

For checks that must run on every PR, add a test to `e2e/network.spec.ts` or `e2e/smoke.spec.ts` instead of a journey. `.nexus/check` runs both through `npm run test:e2e`.

## Evidence

Write evidence under `artifacts/verify/<journey>-<time>/`. `artifacts/` is gitignored, and cleanup never deletes it.

- `evidence(page, name)` writes `<name>.png` and `<name>.aria.yml`. Take one before the action and one after it, not only the final screen.
- Prove side effects from a second view. A guest action is proven when the admin view shows it, and an admin action when the phone shows it.
- Drive the real user path: the join link, the code form, the buttons. Never call internal endpoints or set cookies by hand to skip a step the feature is about.
- Use placeholder names such as `Testgäst k3f9`. The repository is public, and so are PR screenshots.
- Screenshots for a PR: guest pages at 390x844, the admin view at 1440x900.

## Cleanup

```sh
node .claude/skills/verify-dilara-bparty/scripts/instance.ts stop <port>    # or --all
```

This kills only the process group that `start` created (npx, vite and workerd), and only if this script recorded it. The log stays in `artifacts/verify/instances/`, and evidence folders are never touched. Close any browser you opened with `close()`. Never kill by process name, because the `web` service runs the same commands.

## Helpers

| Helper | Run it as |
|---|---|
| `scripts/instance.ts` | `node .claude/skills/verify-dilara-bparty/scripts/instance.ts start [port]`, `… doctor <base-url>`, `… stop <port>\|--all` |
| `scripts/journeys/join-by-link.ts` | `node .claude/skills/verify-dilara-bparty/scripts/journeys/join-by-link.ts <base-url> [evidence-dir]` |
| `scripts/verify.ts` | imported by journeys: `import { openVerify, readSecrets } from "../verify.ts"` |
| Network tests | `npm run test:e2e` (builds the Worker, serves it on port 4317 with test secrets) |
| Staging deploy (Mac) | `scripts/deploy-staging.sh [--dry-run]` |
| Party rehearsal | `JOIN_SECRET=… ADMIN_SECRET=… npm run rehearse -- --base-url <url> [--browser chromium\|webkit] [--guests 20] [--out <dir>]` |

## Party rehearsal

`npm run rehearse` runs about 20 phones in separate browser contexts plus one admin laptop against any deployment. Each phone gets a placeholder name tagged with the run, a device (iPhone 15 or Pixel 7) and a network profile (good, slow 4G, bad 3G, flaky). The steps then join everyone by link or code, lock and unlock phones, drop flaky phones cleanly and silently, rejoin two phones that lost their cookie by name, upload contest photos (one phone offline, one cut mid-send), vote for known photos, replace a voted photo into the hall of fame, and close and reopen voting. After each step, a probe guest arrives and leaves, and every phone must show the count change. That proves each phone is live, not just showing a stale screen. The admin view must show each change.

It writes `report.md`, `report.html`, `report.png`, `report.json`, `rehearsal.gif` (the admin's player list and three phones) and screenshots of failures to the folder it prints. It exits 1 on any failed check. Its timings include CPU contention from every phone running on one machine, and a dev server target inflates page loads (the report notes it).

```sh
set -a; . ./.dev.vars; set +a
npm run rehearse -- --base-url "$BASE_URL"                     # local, chromium
npm run rehearse -- --base-url "$BASE_URL" --guests 8          # quicker
```

`--browser webkit` uses Playwright's WebKit with the same device profiles. WebKit has no CDP, so a phone there gets route-based HTTP latency without a bandwidth cap, and a locked phone only loses its socket (no page freeze). The report notes this. Playwright's WebKit download is blocked on the pylon, so run WebKit on the Mac.

### Adding steps for a feature

The steps are in `e2e/rehearsal/steps/`. `index.ts` holds the run order. `presence.ts` holds join, lock, drop, rejoin and the final `settle`. `photos.ts` holds upload, vote and hall-of-fame, and is the example to follow. For the quiz:

1. Write `e2e/rehearsal/steps/quiz.ts` that exports `Step[]`. A `Step` is `{ id, title, run(r) }` from `e2e/rehearsal/rehearsal.ts`.
2. Add them to `steps` in `index.ts`, after `photoSteps` and before `settle`.
3. In `run`, drive the admin with `r.admin` and the phones with `r.guests` (each has `page`, `line`, `profile` and the current `name`). Record outcomes with `r.check(label, fn, page)`, per-phone durations with `r.time(kind, guest, fn)` (the report groups these by network profile), and observations with `r.note(text)`.
4. Leave every guest online and current at the end of the step.

Quiz rounds belong there, with speed fairness checks: start a question while some phones are on `bad-3g` or mid-`cut`, and use `r.time` to compare when each profile saw the question and when its answer was accepted. Derive expected scores from a table of who answered what, as `photos.ts` does for votes.

## Staging

Staging is the Worker `dilara-bparty-staging` on workers.dev (`env.staging` in `wrangler.jsonc`). It has no custom domain, and its own Durable Object storage and secrets, so a rehearsal never touches party data. Only the person's Mac deploys it; the pylon has no Cloudflare account.

Keep the staging secrets in the macOS Keychain under service `dilara-bparty-staging`, once:

```sh
for name in JOIN_SECRET ADMIN_SECRET; do
  security add-generic-password -U -s dilara-bparty-staging -a "$name" -w "$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')"
done
```

Deploy with the script (`npx wrangler login` first; add `--dry-run` to stop before the upload):

```sh
scripts/deploy-staging.sh
```

It builds with `CLOUDFLARE_ENV=staging` and the secrets unset, because the Vite plugin copies dev values into `dist/<env>/.dev.vars` for `vite preview`. They come from `.dev.vars.staging` or else `.dev.vars`, plus any required secret in the environment. The script keeps an empty `.dev.vars.staging` and refuses to deploy if any `.dev.vars` is under `dist/`. It passes the Keychain values to `wrangler deploy --secrets-file` in a temporary mode-600 JSON file that a trap deletes. Don't pass them by process substitution: macOS fails with `"/dev/fd/12" is not valid`. Never export the secrets before a build.

The deploy prints the URL, `https://dilara-bparty-staging.<account-subdomain>.workers.dev`. Then rehearse, with the secrets in that command's environment only:

```sh
npx playwright install chromium webkit
export STAGING=https://dilara-bparty-staging.<account-subdomain>.workers.dev
for browser in chromium webkit; do
  JOIN_SECRET="$(security find-generic-password -s dilara-bparty-staging -a JOIN_SECRET -w)" \
  ADMIN_SECRET="$(security find-generic-password -s dilara-bparty-staging -a ADMIN_SECRET -w)" \
  npm run rehearse -- --base-url "$STAGING" --browser "$browser"
done
```

Staging keeps its players between runs. The rehearsal tags names per run and counts only its own guests, so old players do no harm. To start clean, delete the Worker with `npx wrangler delete --name dilara-bparty-staging` and deploy again. Then check in the Cloudflare dashboard that its Durable Object namespace went with it, because this was not tried.
