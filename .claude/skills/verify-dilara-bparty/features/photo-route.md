# Gated photo route

Every stored photo is served only through `/photos/<id>`, and only to a joined guest or the admin. Each version has its own URL that never changes, so phones cache it once. The landing photo also has a route under the join link, so the landing page can show it before the guest has a cookie.

## Sub-features

- `photo-guest` answers 200 with the image to a joined guest's cookie.
- `photo-admin` answers 200 to the admin cookie.
- `photo-anonymous` answers 401 without a valid cookie.
- `photo-unknown` answers 404 for an ID that doesn't exist or isn't well formed.
- `photo-cache` sends `Cache-Control: private, max-age=31536000, immutable` and an `ETag` of the ID.
- `photo-landing-link` serves only the landing photo under `/j/<secret>/photos/<id>`, and 404 under a wrong secret.

## How to get to it (user POV)

- A guest's phone loads photos as images in the app. Today that is only the landing photo on the join page.
- The admin view loads the landing photo preview from `/photos/<id>`.

## Driving it with Playwright

Preconditions:

- A landing photo uploaded (see [landing-photo.md](./landing-photo.md)), and its ID read from the admin preview with `await admin.getByAltText("Current landing photo").getAttribute("src")`.
- A joined phone `page` and a cookieless context `anon`.

- **Guest.** Run `const res = await page.request.get(src)`. `res.status()` is 200, `content-type` is `image/jpeg`, and `cache-control` contains `immutable`.
- **Admin.** Run `await admin.request.get(src)`. The status is 200.
- **Anonymous.** Run `await anon.request.get(src)`. The status is 401.
- **Unknown.** Request `/photos/AAAAAAAAAAAAAAAAAAAAAA` with the guest cookie. The status is 404.
- **Landing link.** Request `/j/${JOIN_SECRET}/photos/<id>` from `anon`: 200. With a wrong secret: 404.
- **Proof.** Record each request's URL path, status and headers in the evidence folder as JSON, with the secret replaced by `<secret>`.

## Gotchas

- `context.request` shares the context's cookies, so it proves the gate the way the browser hits it.
- The photo contest will add guest photos and thumbnails behind the same route. Add their cases here.
- A 401 is the correct answer for a cookieless request. A 404 there means the route didn't match.
