# dilara-bparty

A web app for a 3-year-old's birthday party: a live quiz and a photo contest, played on the guests' own phones. The host runs an admin view on a laptop. The spec is [docs/design.md](docs/design.md) and [docs/hosting.md](docs/hosting.md); read both before changing behaviour.

## Stack and layout

TypeScript on Cloudflare Workers with static assets, one Durable Object (`Party`, SQLite storage, WebSocket Hibernation API), Vite with `@cloudflare/vite-plugin`, and Preact.

- `src/worker/`: the Worker and the Durable Object. `routes.ts` is the route table. `auth.ts` signs the `pid` and `admin` cookies. `party.ts` is the Durable Object, `players.ts` and `photo-store.ts` its tables, `schema.ts` its migrations (append a step, never edit one).
- `src/shared/`: types used on both sides. `model.ts` has the branded ids and parsers. `protocol.ts` has the WebSocket messages.
- `src/client/`: three pages, one per HTML entry (`neutral.html`, `guest.html`, `admin.html`). `live.ts` is the reconnecting WebSocket.
- `test/`: Worker tests in the Workers runtime. `test/client/` drives `live.ts` with fake timers and a stub WebSocket. `e2e/`: the Playwright smoke and network tests, the PR media script, and the party rehearsal in `e2e/rehearsal/`.

Photos are blobs in the Durable Object's SQLite, one row per version, at most about 2 MB each. There is no R2. Serve them only through `/photos/<id>`, which checks the cookie and sends an immutable cache header.

## Run, test, typecheck

```sh
.nexus/setup             # once: npm install, Chromium, fonts, ffmpeg
npm run dev              # Vite dev server; secrets come from .dev.vars (see .dev.vars.example)
npm run typecheck        # wrangler types --check, then tsc
npm test                 # Worker tests (vitest)
npm run test:e2e         # Playwright smoke and network tests against a fresh build
npm run media            # screenshots and videos into artifacts/
npm run rehearse -- --base-url <url>   # 20 phones on mixed networks; JOIN_SECRET and ADMIN_SECRET from the environment; refuses on the party day and on a party with content
.nexus/check             # what a PR must pass: install, typecheck, test, test:e2e
```

Set `WRANGLER_SEND_METRICS=false`. Never deploy from a pylon; everything runs locally under miniflare. Open `/admin/<ADMIN_SECRET>` to get the admin cookie, and `/j/<JOIN_SECRET>` to join.

To prove a guest or admin behaviour in a real browser, use the `verify-dilara-bparty` skill in `.claude/skills/`. It launches an isolated instance, has a recipe per feature, and explains the network tests and the rehearsal. A feature thread adds its feature file to `features/` and its rehearsal steps to `e2e/rehearsal/steps/`.

## Staging

`env.staging` in `wrangler.jsonc` is the Worker `dilara-bparty-staging` on workers.dev, with no custom domain and its own Durable Object storage and secrets. Only the person's Mac deploys it. Its secrets live in the macOS Keychain under service `dilara-bparty-staging`, accounts `JOIN_SECRET` and `ADMIN_SECRET`.

```sh
# once: create the secrets
for name in JOIN_SECRET ADMIN_SECRET; do
  security add-generic-password -U -s dilara-bparty-staging -a "$name" -w "$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')"
done
# deploy (after npx wrangler login); add --dry-run to check without deploying
scripts/deploy-staging.sh
# rehearse, with the secrets in the environment of this command only
npx playwright install chromium webkit
JOIN_SECRET="$(security find-generic-password -s dilara-bparty-staging -a JOIN_SECRET -w)" \
ADMIN_SECRET="$(security find-generic-password -s dilara-bparty-staging -a ADMIN_SECRET -w)" \
npm run rehearse -- --base-url https://dilara-bparty-staging.<account-subdomain>.workers.dev [--browser webkit]
```

`scripts/deploy-staging.sh` builds with `CLOUDFLARE_ENV=staging` and the secrets unset, then deploys. The Vite plugin copies dev values into `dist/<env>/.dev.vars` for `vite preview`, from `.dev.vars.staging` or else `.dev.vars`, plus any required secret in the environment. So the script keeps an empty `.dev.vars.staging` and refuses to deploy if any `.dev.vars` is under `dist/`. It passes the Keychain values in a temporary mode-600 JSON file that a trap deletes. Process substitution (`<(…)`) fails on macOS with `"/dev/fd/12" is not valid`. Never export the secrets before a build.

The party is on Saturday 2026-11-07. Hard rule: no rehearsal and no other load against staging or production on 2026-11-07, counted as the UTC day. Staging shares the Cloudflare account's free daily Durable Object allowance with production, and that allowance resets at 00:00 UTC (see [docs/hosting.md](docs/hosting.md#durable-object-request-budget)). `npm run rehearse` refuses any non-local base URL on that date unless you pass `--force`.

Rehearse against production only before the host has entered real content. The rehearsal ends with the finale's wipe, so it refuses a target that holds quiz questions, a landing photo or contest photos unless you pass `--force`.

## Conventions

- Parse external input (bodies, cookies, path params, WebSocket messages) at the boundary into the types in `src/shared/model.ts`, then trust the types.
- Prefer tables keyed by a discriminant (routes, admin commands) over if-chains.
- The server sends a full state snapshot on every change and on every connect. Clients replace their state; there are no deltas.
- Keep the Worker light (10 ms CPU per request on the Free plan) and the pages and messages small (phones on weak mobile data).
- Comments only for a non-obvious why.
- Tests drive the Worker through `fetch` and WebSockets and assert what a phone or the admin can observe.

## Ground rules

- The repository is public. Never commit real party content: no real questions, names or photos. Use placeholders.
- Guest UI is Swedish, natural, warm and short. The admin view is English.
- Theme: snow, ice and princess in light blue, white and silver, with snowflakes and a little sparkle. Our own design; no copyrighted characters or film imagery.
- A product question the spec doesn't settle goes to the person. Small calls are yours; say what you assumed.
- One PR per thread, small conventional commits, a concise PR description. The person merges.
- PR screenshots at 390x844 for guest pages and 1440x900 for admin, clips as GIFs. Media goes to the orphan `pr-media` branch under a folder named after the PR branch, never to the PR branch.

## Done means

`.nexus/check` passes, the change works in a browser on `npm run dev` at phone size, it has tests for its behaviour, and the PR shows it with screenshots or a GIF.
