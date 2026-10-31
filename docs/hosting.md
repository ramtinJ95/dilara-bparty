# Hosting plan

The party app runs entirely on Cloudflare's free Workers plan at
`https://party.handmadeoasis.com`. Nothing runs at home, so the Mac mini and the
home internet connection play no part on the day, and nothing on the home
network is exposed.

## The setting

- About 20 guests, ages 30 to 55, mostly non-technical, each on their own phone
  and mostly on mobile data.
- The venue has no TV or projector. The host's laptop is the only shared screen.
- The app is open for a few hours on the party day, then shut down and wiped.

## Architecture

- **Worker**: serves the frontend as static assets, checks the join cookie, and
  routes live connections to the game. It must stay light, since the Free plan
  gives each Worker request 10 ms of CPU.
- **One Durable Object for the game**: holds players, the current question,
  answers and scores in its SQLite storage. Every phone and the host view keep a
  WebSocket open to it, so it can push the next question and the leaderboard to
  everyone at once. Use the WebSocket Hibernation API so it sleeps between
  messages.
- **Host view on the laptop**: shows the QR code and short join code while people
  join, then runs the game (current question, countdown, leaderboard). Phones
  mainly show answer buttons, which keeps them fast on weak mobile data.

## Joining and access

- The laptop shows a QR code for a secret join link such as
  `party.handmadeoasis.com/j/<secret>`, plus a short code to type in for phones
  that won't scan.
- Opening the link sets a cookie; the guest types a display name and is in. No
  accounts, emails or passwords.
- Without the secret, the site shows nothing useful, and that includes photos.
- The host view uses its own separate admin secret.
- Both secrets are Worker secrets (`wrangler secret put`), never in the repo.
- Send `noindex` headers and serve a `robots.txt` that blocks indexing.

## Cost

This is free. Cloudflare's Free plan doesn't bill for overage: past a daily limit,
requests of that type fail until the reset at 00:00 UTC. The paid plan ($5 per
month) isn't needed.

Free plan allowances per day, compared with a padded estimate for one party
(20 players, about 20 questions, about 3 hours):

| Resource | Free per day | Party estimate |
|---|---|---|
| Worker requests | 100,000 | 1,000 to 2,000 |
| Durable Object requests (a WebSocket connect is 1; 20 incoming messages count as 1) | 100,000 | about 200 |
| Durable Object duration | 13,000 GB-s | under 1,350 GB-s, even if it never hibernates |
| SQLite rows written | 100,000 | a few hundred |
| SQLite rows read | 5,000,000 | a few thousand |
| SQLite storage | 5 GB total | under 1 MB |
| Static asset requests | unlimited | |

Unknown: the docs don't state a maximum number of WebSockets per Durable
Object. Twenty is far below anything that should matter, but test with real
phones before the day.

## Privacy: public repo, private content

The repo is public. The quiz questions, answers and any photos of Dilara must
**not** be committed. How the content gets into the app (for example, a
git-ignored content file that's deployed with the Worker, or entered through the
host view) is still to be decided, but the rule is fixed.

## On the day and after

- Before: deploy, then open the site on a phone using mobile data to check it
  works.
- During: the game refuses new joins after a set end time, and the host view can
  end it at any time.
- After: remove the `party.handmadeoasis.com` custom domain or delete the
  Worker, and wipe the Durable Object's stored data.

## Risks

- **Venue connectivity** is the biggest one. Keep pages and messages tiny, and
  make phones reconnect automatically and pick up the current state.
- **Cloudflare outage**: now the single point of failure, but far more reliable
  than a home connection.

## Cloudflare setup

`handmadeoasis.com` is already a Cloudflare zone (home-chat's tunnel uses it), so
the custom domain is one route in the Wrangler config. Any dashboard clicking
can be done by an Astra worker in a browser session once the owner has logged
in.

## Sources

- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Gating static assets with a Worker](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
