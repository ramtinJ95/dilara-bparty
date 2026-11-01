# Gated photo route

Every stored photo is served only through `/photos/<id>`, and only to a joined guest or the admin. Each version has its own URL that never changes, so phones cache it once. The landing photo also has a route under the join link, so the landing page can show it before the guest has a cookie.

## Sub-features

- `photo-guest` answers 200 with the image to a joined guest's cookie for the landing photo, the guest's own contest photo, photos in the gallery, the photo of a question that has started in this run, and a revealed photo winner. Any other photo answers 404 to a guest.
- `photo-admin` answers 200 to the admin cookie.
- `photo-anonymous` answers 401 without a valid cookie.
- `photo-unknown` answers 404 for an ID that doesn't exist or isn't well formed.
- `photo-cache` sends `Cache-Control: private, max-age=31536000, immutable` for landing, contest and thumbnail photos, and `private, no-cache` for question photos. The `ETag` is the ID in quotes, and a matching `If-None-Match` gets 304.
- `photo-landing-link` serves only the landing photo under `/j/<secret>/photos/<id>`, and 404 under a wrong secret.

## How to get to it (user POV)

- A guest's phone loads photos as images: the landing photo on the join page, and contest photos and thumbnails in Mitt foto and Galleri.
- The admin view loads the landing photo preview from `/photos/<id>`.

## Driving it with Playwright

Preconditions:

- A landing photo uploaded (see [landing-photo.md](./landing-photo.md)), and its ID read from the admin preview with `await admin.getByAltText("Current landing photo").getAttribute("src")`.
- A joined phone `page` and a cookieless context `anon`.

- **Guest.** Run `const res = await page.request.get(src)`. `res.status()` is 200, `content-type` is `image/jpeg`, and `cache-control` contains `immutable`.
- **Admin.** Run `await admin.request.get(src)`. The status is 200.
- **Anonymous.** Run `await anon.request.get(src)`. The status is 401.
- **Revalidate.** Repeat the guest request with `headers: { "if-none-match": res.headers().etag }`. The status is 304.
- **Unknown.** Request `/photos/AAAAAAAAAAAAAAAAAAAAAA` with the guest cookie. The status is 404.
- **Landing link.** Request `/j/${JOIN_SECRET}/photos/<id>` from `anon`: 200. With a wrong secret: 404.
- **Proof.** Record each request's URL path, status and headers in the evidence folder as JSON, with the secret replaced by `<secret>`.

## Gotchas

- `context.request` shares the context's cookies, so it proves the gate the way the browser hits it.
- Contest photos and thumbnails use the same route. A contest photo's ID is the `src` of `Din bild` in Mitt foto once the upload has finished. While it uploads, that `src` is a local `blob:` preview.
- Question photos are `no-cache` on purpose: a guest may fetch one only while its question has started in this run (see [quiz.md](./quiz.md)).
- A 401 is the correct answer for a cookieless request. A 404 there means the route didn't match.
