# Guest shell and tabs

After joining, the guest app greets the guest by name, shows how many guests are here right now, and has three tabs: Quiz, Mitt foto and Galleri. Mitt foto and Galleri belong to the photo contest (see [photo-contest.md](./photo-contest.md)); the Quiz tab is covered in [quiz.md](./quiz.md). A pill shows while the phone is (re)connecting.

## Sub-features

- `shell-greeting` shows `Hej, <name>!` and follows admin renames live.
- `shell-online` shows `1 gäst här just nu` or `<n> gäster här just nu`, counting distinct online players.
- `shell-tabs` switches between `Quiz`, `Mitt foto` and `Galleri`, keeps the choice in the URL hash and across a reload.
- `shell-quiz-locked` shows `Quizet är inte öppet än` on the Quiz tab until the quiz opens.
- `shell-pill` shows `Ansluter…` before the first state and `Återansluter…` while reconnecting.
- `shell-gate` redirects `/app` to `/` without a valid cookie.

## How to get to it (user POV)

- Join (see [join.md](./join.md)); the phone lands on `/app`.
- Open `/app` again later on the same phone.

## Driving it with Playwright

Preconditions:

- A joined phone `page` for `Testgäst <tag>` and a laptop page on the admin view.

- **Greeting and count.** Run `await expect(greeting(page, name)).toBeVisible()` and `await expect(page.getByText(guestsHere(n), { exact: true })).toBeVisible()`, where `n` is the admin's `· <n> online`.
- **Count is live.** Join a second phone. The first phone shows `guestsHere(n + 1)` without a reload. Close the second phone's context. The count goes back to `n`.
- **Tabs.** Run `await page.getByRole("button", { name: "Mitt foto" }).click()`. The URL ends in `#mitt-foto`, the `Mitt foto` heading shows, and the button has `aria-current="page"`. Do the same for `Galleri` (`#galleri`).
- **Tab survives reload.** On `Galleri`, run `await page.reload()`. `Galleri` still has `aria-current="page"`.
- **Quiz locked.** On `Quiz`, the heading `Quizet är inte öppet än` and `Vi säger till när det är dags!` show.
- **Gate.** In a fresh context, run `await page.goto("/app")`. The URL becomes `/` and the `Kod` field shows.
- **Proof.** `evidence()` on each tab at 390x844.

## Gotchas

- The pill has `role="status"`. Use `reconnecting(page)` from `e2e/drive.ts`, which matches `Återansluter…` only.
- The count includes every online player, including other test phones on the same instance. Derive the expected number from the admin view, not a constant.
- Once the quiz is unlocked, the Quiz tab's header is compact and hides the guest count. Read the count on `Mitt foto` or `Galleri`.
