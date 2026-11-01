# Photo contest

Each guest has one contest photo, uploaded from Mitt foto, and can replace or remove it. Galleri shows every current photo without names, plus a hall of fame of replaced photos that still have votes. Each guest has 3 votes, can stack them, and can't vote for their own photo. The admin sees a live tally, every stored version, and controls for uploads, voting and hiding.

## Sub-features

- `contest-upload` shrinks the photo on the phone, shows `Gör i ordning bilden…`, `Skickar bilden…` and a progress bar, then `Inga röster än`.
- `contest-upload-retry` shows `Anslutningen bröts. Bilden skickas igen så fort nätet är tillbaka.` and a `Försök igen` button when a try fails or stalls. It sends the photo again, with the same key, when the network returns, the page comes back to the foreground or the live socket reconnects, so the admin still lists one version. While the phone is offline it waits for the network and makes no requests.
- `contest-upload-stall` gives up on a try after 8 s without upload progress or a response (`STALL_MS` in `src/client/upload.ts`), instead of the 30 s it used to wait. A slow upload that keeps moving is never cut off.
- `contest-upload-stuck` stops after 4 automatic tries and shows `Bilden kom inte fram. Du behöver inte välja den igen, tryck bara på Försök igen.` The shrunk photo stays on screen, and `Försök igen` starts a new round.
- `contest-vote` gives a vote with `Ge en röst` and takes it back with `Ta tillbaka en röst`; `3 av 3 röster kvar` counts down, and the uploader sees `Din bild har 1 röst`.
- `contest-replace` asks before replacing a photo with votes (`Byter du bild flyttar den här till Hall of fame…`), then moves the old photo to `Hall of fame` with its votes.
- `contest-remove` asks before removing a photo with votes (`Tar du bort bilden går rösten tillbaka till den som röstade.`), and the votes go back to the voters.
- `contest-admin-toggles` opens and closes uploads and voting. Phones show `Uppladdningen är stängd.` and `Röstningen är stängd.`
- `contest-admin-tally` ranks photos by votes with `hall of fame` and `tie` badges. `Every version` lists each entrant's versions with `Hide` and `Unhide`. `Download all (zip, n)` saves everything.

## How to get to it (user POV)

- A joined guest taps `Mitt foto` or `Galleri` in the tab bar.
- On the laptop admin view, the `Photo contest` card.

## Driving it with Playwright

Preconditions:

- A laptop page on the admin view, and joined phones. Uploads and voting are open on a new party.
- Placeholder images from `placeholder(page, LOOKS.snow)` and `pngFile(name, buffer)` in `e2e/placeholder.ts`. Never real photos.

- **Upload.** Tap `Mitt foto`, then run `await page.locator('input[type="file"]').setInputFiles(pngFile("snow", await placeholder(page, LOOKS.snow)))`. `Inga röster än` and the `Byt bild` button appear. The admin's `.versions li` count for that entrant is 1.
- **Upload offline.** On `phone("flaky")`, run `line.cut("clean")` before the upload. The phone shows `Anslutningen bröts.` Run `line.restore()`. The upload finishes, and the admin still lists one version.
- **Upload cut mid-send.** Chromium finishes a request it has started even after `line.cut`, so play the tunnel with a route: on the first `POST /api/photo`, `await line.cut("clean")`, then `await route.fetch()` and never fulfil it, so the server stores the photo but the phone never hears back. Pick `pngFile("noise", await noise(page))` from `e2e/placeholder.ts`. Within about 8 s the phone shows `Anslutningen bröts.`, the photo and `Försök igen`, and it makes no further request while offline. Run `line.restore()`. The phone shows `Inga röster än` after one more request, and the admin lists one version. `e2e/network.spec.ts` does exactly this and records the time as an annotation.
- **Stuck.** Route `POST /api/photo` to `route.abort("internetdisconnected")` with the phone online. After about 7 s of backoff the phone shows `Bilden kom inte fram.` Unroute and tap `Försök igen`; the upload finishes.
- **Vote.** On another phone, tap `Galleri` and find the tile by its thumbnail: `page.locator(".gallery .tile").filter({ has: page.locator(\`img[src="${thumb}"]\`) })`, where `thumb` is the `src` of that uploader's row in the admin's `.tally`. Click `Ge en röst`. The phone shows `2 av 3 röster kvar` and `Dina röster: 1` on the tile. The uploader shows `Din bild har 1 röst`, and the tally row shows `1 vote`.
- **Own photo.** The uploader's own tile shows `Din bild` and no vote buttons.
- **Replace into the hall of fame.** On the voted uploader, click `Byt bild`, read the confirmation, then click `Välj ny bild` inside `page.waitForEvent("filechooser")` and set a new file. The phone shows `Din tidigare bild är kvar i Hall of fame och kan fortfarande vinna.` Every phone's Galleri shows the `Hall of fame` heading. The entrant has 2 versions, and a tally row with the `hall of fame` badge.
- **Close voting.** On the laptop, click `Close voting`. Every phone's Galleri shows `Röstningen är stängd.` Click `Open voting` to restore it.
- **Hide.** Click `Hide` on a version. The photo leaves every Galleri, and its votes return to the voters. The uploader's Mitt foto shows `Kalasvärden har gömt bilden från galleriet. Byt gärna till en annan.`
- **Proof.** `evidence()` on Mitt foto before and after the upload, on Galleri after the vote, and on the laptop's tally and versions.
- **At scale.** The rehearsal's `upload`, `vote` and `hall-of-fame` steps in `e2e/rehearsal/steps/photos.ts` do all of this on 20 phones.

## Gotchas

- The gallery has no names, so find a photo by its thumbnail `src` from the admin tally, not by tile order.
- `Byt bild` on a photo without votes opens the file picker directly, with no confirmation and no hall of fame.
- An upload already in flight may keep going through `line.cut`, because Chromium's offline emulation doesn't always stop a request it has started, and its upload throttling had already sent the whole body when the progress bar said 30 %. Cut before the upload, or hold the request in a route as in **Upload cut mid-send**, to test the retry reliably.
- A routed request reports no upload progress, so it sits at `Skickar bilden… 0%` until the stall window ends.
- An upload that finishes while the live socket is down stays on `Klart!` until the socket is back, so the guest never sees an empty `Välj bild` and picks the photo again.
- On staging, photos from earlier rehearsals stay in the gallery. Assert on photos you uploaded in this run.
- The file input accepts `image/*`, and the phone always re-encodes to JPEG, so the stored type is `image/jpeg`.
- Opening the finale closes voting for good (see [finale.md](./finale.md)).
