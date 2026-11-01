# Join the party

A guest opens the join link from the QR code, or types the short code on the bare site, then types a name and lands in the guest app. The bare site and wrong links show nothing about the party.

## Sub-features

- `join-link` opens the landing page from `/j/<secret>` and joins with a name.
- `join-code` turns the typed code into the join link, ignoring case, spaces and hyphens.
- `join-name-rules` rejects an empty or blank name (button disabled), names over 30 characters (input stops) and control characters (alert).
- `join-closed` refuses a new name after the host ends the party with `Kalaset är slut. Tack för att du var med!` (see [finale.md](./finale.md)). An existing name can still reclaim.
- `join-cookie` sends a joined guest who opens the link again straight to `/app`.
- `join-neutral` keeps `/`, wrong links and `/guest.html` free of party content.

## How to get to it (user POV)

- Scan the QR code on the admin laptop, which opens `$BASE_URL/j/$JOIN_SECRET`.
- Open `$BASE_URL/`, type the code shown under the QR code (such as `K87 YWP`) and press `Fortsätt`.

## Driving it with Playwright

Preconditions:

- Baseline instance, a laptop page on the admin view, and a phone from `phone()`.

- **Link entry.** Open the link. Run `await page.goto(\`/j/${JOIN_SECRET}\`)`. The heading `Dilara fyller 3!` and the label `Vad heter du?` are visible.
- **Join.** Type a name and press the button. Run `await page.getByLabel("Vad heter du?").fill(name)` and `await page.getByRole("button", { name: "Gå med" }).click()`. The URL ends in `/app` and `greeting(page, name)` (`Hej, <name>!`) is visible.
- **Admin sees it.** Run `await expect(onlineDot(admin, name)).toBeVisible()`. The admin's player count goes up by one.
- **Code entry.** Read the code from the laptop with `await admin.locator(".code").textContent()`. On a fresh phone, run `joinByCode(page, code.toLowerCase(), name)`. The phone passes through `/j/<secret>` and greets the guest.
- **Wrong code.** Run `await page.getByLabel("Kod").fill("AAA 222")` and click `Fortsätt`. The alert reads `Fel kod, försök igen.`
- **Name rules.** With an empty name, `Gå med` is disabled. Fill a name with a control character such as `"a\u0007b"` and submit. The alert reads `Namnet innehåller tecken som inte fungerar.`
- **Cookie holds.** On the joined phone, run `await page.goto(\`/j/${JOIN_SECRET}\`)`. The URL becomes `/app` with the same greeting.
- **Neutral.** Run `await page.goto("/")`. The body has no `Dilara`. `page.goto("/j/not-the-secret")` and `page.goto("/guest.html")` answer 404.
- **Proof.** `scripts/journeys/join-by-link.ts` runs link entry, admin, and cookie end to end and saves five evidence files.

## Gotchas

- The join page has a maximum length of 30 on the input, so `fill` with a longer name silently truncates. Assert the greeting, not the draft.
- A name that already exists, in any case, leads to `Är det du?` instead of a new player. See [reclaim.md](./reclaim.md).
- The code is derived from `JOIN_SECRET`, so it differs between instances. Always read it from the laptop.
- The admin view shows the full join URL with the secret. Don't publish that screenshot from staging or production.
