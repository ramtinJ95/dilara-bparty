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
- **Photos in the Durable Object**: contest photos, question photos and the
  landing photo are stored as blobs in the Durable Object's SQLite database,
  each version in its own row. SQLite limits a row to 2 MB, and phones shrink
  photos to about 300 KB before upload, so the server rejects anything over
  2 MB. Phones load photos through a Worker route that checks the join cookie,
  so a photo link is useless without having joined. Each version has its own
  URL and never changes, so phones can cache it and don't download it twice.
  R2 was considered and dropped: enabling it needs a paid subscription with a
  card on file, and past its free tier it bills instead of failing.
- **Admin view on the laptop** (also usable on a phone): shows the QR code and
  short join code, and controls the game. There is no shared game screen; each
  phone shows the full quiz and photo contest. See [design.md](design.md).

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
| Durable Object requests (see [the budget](#durable-object-request-budget)) | 100,000, shared with staging | under 12,500 in the worst case |
| Durable Object duration | 13,000 GB-s | under 1,350 GB-s, even if it never hibernates |
| SQLite rows written | 100,000 | about 3,000, mostly alarms |
| SQLite rows read | 5,000,000 | a few thousand |
| SQLite storage | 5 GB total | under 100 MB, almost all photos |
| Static asset requests | unlimited | |

### Durable Object request budget

Durable Object requests are the allowance the party can actually run out of,
and the limit covers the whole Cloudflare account, staging included. Past it,
every connect and command fails until 00:00 UTC. Count every incoming message
in full: the docs apply the 20:1 WebSocket ratio "for compute requests
billing-only" and don't say whether the Free plan's daily limit uses it.

So phones never ping. Incoming messages are billed and outgoing ones are not,
so the server keeps connections alive instead: while anyone is connected, an
alarm sends every open socket a tiny tick, one request for all of them. The
server owns a mode and sends it with every snapshot, so every phone switches
together:

- **Fast**, from unlock until the quiz ends or is reset, or while the admin
  turns it on: a tick every 4 s, and a phone that hears nothing for 11 s
  reconnects.
- **Slow**, the rest of the day: a tick every 30 s, and a phone reconnects
  after 70 s of silence.

In both modes a phone checks its socket when the guest looks or acts. Coming
back to the page or online reconnects at once if the socket is past its
silence limit. Otherwise, in slow mode, that and switching tabs or starting an
upload send one ping, at most every 15 s, which the Durable Object answers with
a pong without waking up. A vote, an answer or any other command is its own
check: the server answers it with an ack or an error, sent to that phone alone.
No reply within 5 s, and the phone reconnects. Ticks and state broadcasts don't
count, since they keep arriving when the phone's own messages don't get
through. So a phone whose socket died outside the quiz recovers as soon as
the guest opens the app, and the host announces the quiz out loud, so guests
reopening the app is how a phone with a dead socket gets the unlock popup.

**Why not tick every 4 s all day: batteries.** After any traffic, a phone's
cellular radio stays in its high-power state for a tail of about 10 to 20 s
before it goes idle, and that tail costs about as much as the transfer itself
(Huang et al., MobiSys 2012). A tick every 4 s never lets the radio idle; a
tick every 30 s lets it idle most of the time. During the quiz the screen is on
and the guest is playing, so the radio cost is small next to the screen.

The tick also keeps idle connections open. Cloudflare closes a WebSocket with
no data in either direction for a while; its docs don't give the time, and
reports put it at 100 s. Some mobile carriers drop idle TCP connections after
less than 10 minutes. 30 s is well inside both.

The cost: the server can't tell that a phone has gone silent. A Durable Object
can't send WebSocket protocol pings, which browsers would answer on their own
and Cloudflare doesn't bill, and anything a phone sends to prove it is alive
is a billed request. A phone in a tunnel or a locked phone with its socket
still open shows online in the admin view until its connection fails, which
can take minutes. Its own phone recovers on its own once the network is back.

Worst case for the party day: 25 phones and the admin laptop in the foreground
for 8 hours, the quiz open for 1 hour, every message counted in full.

| What | Count | Requests |
|---|---|---|
| Fast ticks: one alarm every 4 s for 1 hour | 900 | 900 |
| Slow ticks: one alarm every 30 s for 7 hours | 840 | 840 |
| Pings from phones on a schedule | none | 0 |
| Checks when the guest looks or acts, outside the quiz: 100 per socket | 26 × 100 | 2,600 |
| WebSocket connects: 50 per socket | 26 × 50 | 1,300 |
| Page loads that ask the Durable Object (`/j/…`; `/app` doesn't): 20 per phone | 25 × 20 | 500 |
| Joins, with retries | 50 | 50 |
| Contest uploads: 10 per phone, each at most 4 automatic tries | 25 × 10 × 4 | 1,000 |
| Photo views (`/photos/…`), cached on the phone: 100 per phone | 2,500 | 2,500 |
| Votes and vote moves: 20 per phone | 500 | 500 |
| Quiz answers: 20 questions | 25 × 20 | 500 |
| Question photo views (`/photos/…`), revalidated on every view: 4 per question | 25 × 20 × 4 | 2,000 |
| Question closes, from the shared alarm | 20 | 20 |
| Quiz and finale steps, question edits by the host | 200 | 200 |
| Other admin commands and photo uploads | 300 | 300 |
| **Total** | | **13,210** |

That is well under half of 30,000, our own cap. A quiz that is never ended
costs 5,460 more alarms, for 18,670. The ticks don't grow with the number of phones,
so more guests cost only their checks, connects and actions. Each alarm also
writes one SQLite row, under 2,000 of the 100,000 rows a day.

**Never run the rehearsal against staging on the party day.** Staging shares the
account's allowance, and a rehearsal spends requests on joins, reconnects and
commands that the party may need.

Photos fit in the same allowances. Twenty guests uploading a few 300 KB photos
each, plus thumbnails and every replaced version, is under 100 MB of the 5 GB,
one row written per upload, and one row read per photo shown, which phone
caching keeps low.

A stalled or failed upload retries with the same key, so the server stores it
once. The phone retries on a backoff timer while it is online, and only on an
`online` event, the page coming back to the foreground or the live socket
reconnecting while it is offline, so it never polls. After 4 tries it stops
until the guest taps `Försök igen`.

Unknown: the docs don't state a maximum number of WebSockets per Durable
Object. Twenty is far below anything that should matter, but test with real
phones before the day.

## Privacy: public repo, private content

The repo is public. The quiz questions, answers and any photos of Dilara must
**not** be committed. Questions and photos are entered through the admin view
and stored in Cloudflare, never in the repo.

## On the day and after

- Before: deploy, then open the site on a phone using mobile data to check it
  works.
- During: the game refuses new joins after a set end time, and the host view can
  end it at any time.
- After: download the photos, remove the `party.handmadeoasis.com` custom
  domain or delete the Worker, and wipe the Durable Object's stored data,
  photos included.

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
- [Durable Objects WebSockets reference](https://developers.cloudflare.com/durable-objects/reference/websockets/): the runtime answers incoming protocol pings; workerd's [`WebSocket`](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/web-socket.h) has no method to send one
- Huang et al., A Close Examination of Performance and Power Characteristics of 4G LTE Networks (MobiSys 2012), summarised in [these lecture slides](https://people.iith.ac.in/fc5260/slides/lecture-3.pdf): the radio's high-power tail after a transfer
- [Cloudflare WebSockets: idle timeout](https://developers.cloudflare.com/network/websockets/#idle-timeout)
- Reports of a 100 s WebSocket idle timeout behind Cloudflare: [oasislabs/e2e-tests#49](https://github.com/oasislabs/e2e-tests/issues/49), [Linux Containers forum](https://discuss.linuxcontainers.org/t/incus-behind-cloudflare-closing-down-due-to-cf-timeout/19696)
- [Wang et al., An Untold Story of Middleboxes in Cellular Networks (SIGCOMM 2011)](https://web.eecs.umich.edu/~zmao/Papers/netpiculet.pdf): carriers with idle TCP timeouts under 10 minutes
- [Gating static assets with a Worker](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
