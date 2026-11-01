# Admin player list

The admin view lists every player with a live online dot and a join time. The host can rename a player and merge a duplicate into the player to keep. Every change reaches the phones at once.

## Sub-features

- `players-live` adds a row when a guest joins and turns the dot on or off as phones connect and leave.
- `players-count` shows `Players <total>` and `· <n> online`, or `Nobody has joined yet.` on an empty party.
- `players-rename` renames a player, and the phone's greeting follows.
- `players-rename-taken` refuses a name another player has, with a toast.
- `players-merge` merges one player into another: the row disappears, and the merged phone now greets with the kept name.

## How to get to it (user POV)

- Open `$BASE_URL/admin/$ADMIN_SECRET` on the laptop. It sets the admin cookie and redirects to `/admin`, which shows `Live` when connected.

## Driving it with Playwright

Preconditions:

- A laptop page after `openAdmin(admin, ADMIN_SECRET)`.
- Two joined phones, `Testgäst <tag> A` and `Testgäst <tag> B`.

- **Live roster.** Run `await expect(onlineDot(admin, nameA)).toBeVisible()`. Close phone A's context. Run `await expect(onlineDot(admin, nameA)).toHaveCount(0)`. The row stays without the green dot.
- **Rename.** Run `renameFromAdmin(admin, nameB, \`${nameB} ny\`)`. It clicks `Rename`, fills `New name for <name>`, and saves. Phone B shows `greeting(pageB, \`${nameB} ny\`)` without a reload.
- **Rename to a taken name.** Rename B to A's name. A toast with `role="alert"` reads `"<name>" is already taken, possibly by a merged duplicate.`, and both rows keep their names.
- **Merge.** On A's row, click `Merge…`, choose B in the `Choose the player to keep…` select, read the warning `“A” disappears and everything of theirs moves to “B”. This can't be undone.`, and click `Confirm merge`. A's row is gone, and phone A (if open) greets with B's name.
- **Reclaim after merge.** On a cookieless phone, join with A's old name. `Är det du?` shows B's name.
- **Proof.** `evidence()` on the laptop before and after each action, and on the phone that should follow.

## Gotchas

- `Save` and `Confirm merge` are disabled while the admin socket is not `Live`.
- Merge can't be undone on an instance. Start a fresh instance instead of trying to reverse it.
- Escape cancels a rename. Clicking outside does not.
- Row lookups use the exact visible name. After a rename, use the new name.
- `Merge…` shows only when there are at least two players.
