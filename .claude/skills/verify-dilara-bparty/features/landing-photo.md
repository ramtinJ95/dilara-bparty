# Landing photo

The host uploads a photo in the admin view, and the join page shows it in the round frame above the name field. The admin's browser shrinks it to 1600 px JPEG before upload. Without a photo, the frame shows a snowflake.

## Sub-features

- `landing-upload` uploads a photo, and the admin preview shows `Current landing photo`.
- `landing-shown` shows the photo with alt text `Dilara` on `/j/<secret>`.
- `landing-replace` replaces it with a new version at a new URL.
- `landing-remove` removes it, and the join page goes back to the snowflake.
- `landing-errors` shows `Use a JPEG, PNG or WebP photo.` or `That photo is still too large after shrinking.`

## How to get to it (user POV)

- On the laptop admin view, the `Landing photo` card has `Upload photo`, then `Replace photo` and `Remove`.

## Driving it with Playwright

Preconditions:

- A laptop page on the admin view. A placeholder image generated on a canvas, never a real photo. `e2e/media.spec.ts` has `snowyPlaceholder(page)`, which draws a snowflake.

- **Upload.** The file input is hidden, so set it directly. Run `await admin.locator('input[type="file"]').setInputFiles({ name: "snow.png", mimeType: "image/png", buffer })`. `admin.getByAltText("Current landing photo")` becomes visible, and the button reads `Replace photo`.
- **Shown to guests.** On a cookieless phone, run `await page.goto(\`/j/${JOIN_SECRET}\`)`. `page.getByAltText("Dilara")` is visible, and its `src` is `/j/<secret>/photos/<id>`.
- **Remove.** Click `Remove`. The admin preview shows `No photo yet`. Reload the join page. No `Dilara` image is shown.
- **Proof.** `evidence()` on the laptop card and the phone's join page, before and after.

## Gotchas

- A guest who already joined is redirected from the join link to `/app` and never sees the landing page. Use a cookieless phone.
- The join page reads the photo ID when it loads. A phone already on the page sees a new photo only after a reload.
- The repository is public. Never upload a real photo, not even on a local instance whose screenshots might end up in a PR.
