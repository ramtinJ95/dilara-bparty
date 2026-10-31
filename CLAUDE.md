# dilara-bparty

A web app for a 3-year-old's birthday party: a live quiz and a photo contest, played on the guests' own phones. The host runs an admin view on a laptop. The spec is [docs/design.md](docs/design.md) and [docs/hosting.md](docs/hosting.md); read both before changing behaviour.

## Stack and layout

TypeScript on Cloudflare Workers with static assets, one Durable Object (`Party`, SQLite storage, WebSocket Hibernation API), Vite with `@cloudflare/vite-plugin`, and Preact.

- `src/worker/`: the Worker and the Durable Object. `routes.ts` is the route table. `auth.ts` signs the `pid` and `admin` cookies. `party.ts` is the Durable Object, `players.ts` and `photo-store.ts` its tables, `schema.ts` its migrations (append a step, never edit one).
- `src/shared/`: types used on both sides. `model.ts` has the branded ids and parsers. `protocol.ts` has the WebSocket messages.
- `src/client/`: three pages, one per HTML entry (`neutral.html`, `guest.html`, `admin.html`). `live.ts` is the reconnecting WebSocket.
- `test/`: Worker tests in the Workers runtime. `test/client/` drives `live.ts` with fake timers and a stub WebSocket. `e2e/`: the Playwright smoke test and the PR media script.

Photos are blobs in the Durable Object's SQLite, one row per version, at most about 2 MB each. There is no R2. Serve them only through `/photos/<id>`, which checks the cookie and sends an immutable cache header.

## Run, test, typecheck

```sh
.nexus/setup             # once: npm install, Chromium, fonts, ffmpeg
npm run dev              # Vite dev server; secrets come from .dev.vars (see .dev.vars.example)
npm run typecheck        # wrangler types --check, then tsc
npm test                 # Worker tests (vitest)
npm run test:e2e         # Playwright smoke test against a fresh build
npm run media            # screenshots and videos into artifacts/
.nexus/check             # what a PR must pass: install, typecheck, test, test:e2e
```

Set `WRANGLER_SEND_METRICS=false`. Never deploy; everything runs locally under miniflare. Open `/admin/<ADMIN_SECRET>` to get the admin cookie, and `/j/<JOIN_SECRET>` to join.

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
