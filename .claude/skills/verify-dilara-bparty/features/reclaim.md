# Är det du? reclaim

A guest who lost their cookie (another browser, cleared cookies, a QR scanner with its own browser) joins again with a name that exists. The phone asks `Är det du?` and, on yes, gives them their old identity back, so the admin still has one player.

## Sub-features

- `reclaim-ask` shows `Är det du?` with the existing name when the typed name matches one, ignoring case.
- `reclaim-yes` joins as the existing player: same name on the phone, no new row for the admin.
- `reclaim-no` returns to the name field with the text selected, so the guest can pick another name.
- `reclaim-merged` reclaims the kept player when the typed name belonged to a merged duplicate.

## How to get to it (user POV)

- Open the join link on a phone without the cookie and type a name that already joined.

## Driving it with Playwright

Preconditions:

- Baseline instance and a laptop page on the admin view.
- A player `Testgäst <tag>` joined from another phone (`joinByLink`).

- **Lose the cookie.** Use a fresh `phone()`, or on the joined phone run `await page.context().clearCookies()` and `await page.reload()`. The reload lands on the neutral code page, because `/app` without a cookie redirects to `/`.
- **Type the same name.** Run `joinByLink(page, JOIN_SECRET, "testgäst <tag>")`. The heading `Är det du?` appears with the text `Någon har redan gått med som` and the stored spelling of the name.
- **Say yes.** Run `await page.getByRole("button", { name: "Ja, det är jag" }).click()`. `greeting(page, "Testgäst <tag>")` is visible, with the stored spelling.
- **Admin has one player.** Run `await expect(admin.locator(".players li .name").getByText(name, { exact: true })).toHaveCount(1)` and `await expect(onlineDot(admin, name)).toBeVisible()`.
- **Say no.** Repeat the first two steps on another phone and press `Nej, byt namn`. The `Vad heter du?` field returns with the name selected.
- **Proof.** `evidence()` on the `Är det du?` card, the greeting after yes, and the laptop list showing one row.

## Gotchas

- Anyone can claim any name this way. The design accepts that risk, so don't report it as a bug.
- `e2e/network.spec.ts` covers this on slow 4G, and the rehearsal's `rejoin` step covers it on good and bad 3G phones.
- The phone that still has the cookie stays connected as the same player. Two phones can share one identity.
