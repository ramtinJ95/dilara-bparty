# dilara-bparty verification map

This directory is the maintained source for verifying what guests and the host can see and do. Read this index, then use the matching feature file as the recipe.

## Baseline preconditions

- An instance started with `instance.ts start`, which serves an empty party at `$BASE_URL`.
- `instance.ts doctor "$BASE_URL"` prints no `FAIL` line and says this script started the instance.
- `JOIN_SECRET` and `ADMIN_SECRET` are in the environment or in `.dev.vars`. Recipes write them as `$JOIN_SECRET` and `$ADMIN_SECRET`. Never publish them. The admin view shows the join URL with the secret, so local evidence contains it; crop or skip that line in anything you share.
- A laptop page opened with `openAdmin(admin, ADMIN_SECRET)` from `e2e/drive.ts` shows `Live`.

## Driving conventions

- Drive with Playwright through `scripts/verify.ts` (`phone()`, `laptop()`, `evidence()`) and the handles in `e2e/drive.ts`.
- Use roles, labels and visible text, as the recipes do. The admin player list has no ARIA names per row, so `adminRow` and `onlineDot` use the `.players li` and `.dot.on` classes.
- Guest text is Swedish and exact: `Vad heter du?`, `Gå med`, `Är det du?`, `Ja, det är jag`, `Hej, <name>!`.
- Give every player a placeholder name with a random tag, such as `Testgäst k3f9`. Names are unique ignoring case, so a reused name triggers `Är det du?`.
- To test a phone on mobile data, pass a profile to `phone("bad-3g")` and see [reconnect.md](./reconnect.md).
- Start each recipe from the baseline unless its preconditions say otherwise. An instance is cheap; start a fresh one rather than undo a merge.

## Proof and skip reporting

- Capture the action and the result: `evidence()` before and after, on both the phone and the laptop when the feature crosses them.
- A guest action is proven when the admin view shows it, and an admin action when the phone shows it.
- Report each feature ID with the entry point you used. A feature reached through one entry point is not verified through the others.
- If a precondition can't be met, report the failure and the unmet precondition. Don't weaken the journey to make it pass.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph about the user-visible behaviour. It then has exactly four H2 sections in this order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)` (every entry point), `Driving it with Playwright` (starts with `Preconditions:`, then labeled bullets that pair an action with code and an observable result), and `Gotchas`. Keep implementation details out unless a trap needs them.

## Features

- [Join the party](./join.md) covers joining by QR link and by typed code, name validation, and wrong links that show nothing.
- [Är det du? reclaim](./reclaim.md) covers a guest who lost their cookie getting their identity back by name.
- [Guest shell and tabs](./guest-shell.md) covers the greeting, the live guest count, the three tabs and the reconnect pill.
- [Admin player list](./admin-players.md) covers the live roster, rename and merge.
- [Landing photo](./landing-photo.md) covers uploading, replacing and removing the photo on the join page.
- [Photo contest](./photo-contest.md) covers uploading with retry, voting, the hall of fame, and the admin's tally and toggles.
- [Gated photo route](./photo-route.md) covers who can fetch `/photos/<id>` and its cache header.
- [Live quiz](./quiz.md) covers the question editor, the unlock popup, playing, closing, revealing and scoring questions, the leaderboard, late joins, reconnects and the end.
- [Finale and end of the party](./finale.md) covers the suspense page, the photo and quiz reveals, photo ties, reconnects during the finale, ending the party and the wipe.
- [Reconnect on bad networks](./reconnect.md) covers slow profiles, drops, frozen tabs and catching up to the current state.
