import { expect, type Locator, type Page } from "@playwright/test";
import { addQuestion, answer, greeting, reconnecting, unlockPopup } from "../../drive.ts";
import { LOOKS, placeholder } from "../../placeholder.ts";
import type { Guest, Rehearsal, Step } from "../rehearsal.ts";

const SEE_TIMEOUT = 30_000;
const AWAY_MS = 3_000;
const LETTERS = "ABCD";
// GRACE_MS in src/shared/quiz.ts, which node cannot import because its own imports have no extension.
const GRACE_MS = 2_000;

const CHOICE = { kind: "choice", text: "Hur många armar har snöflingan på bilden?", options: ["Sex armar", "Fyra armar", "Åtta armar"], correct: 0, seconds: 60 } as const;
const NUMBER = { kind: "number", text: "Hur många snöbollar ryms i en hink?", answer: 7, seconds: 20 } as const;

const allOnline = (r: Rehearsal) => r.baselineOnline + r.guests.length;
const indexOf = (r: Rehearsal, g: Guest) => r.guests.indexOf(g);
// Every third guest picks a wrong option, spread over all network profiles.
const choicePick = (r: Rehearsal, g: Guest) => (indexOf(r, g) % 3 === 2 ? 1 : CHOICE.correct);
const numberGuess = (r: Rehearsal, g: Guest) => 1 + (indexOf(r, g) % 10);
// Two guests on slow 4G let the clock run out, so the closest-number round closes at its deadline, not early.
const silentInRound2 = (r: Rehearsal) => new Set(r.guests.filter((g) => g.profile === "slow-4g").slice(0, 2));

const phaseOf = (r: Rehearsal) => r.admin.locator(".quiz .phase");
const onQuestion = (page: Page, text: string, input: string) => Promise.all([
  expect(page.getByRole("heading", { name: text })).toBeVisible({ timeout: SEE_TIMEOUT }),
  expect(page.locator(input)).toBeVisible({ timeout: SEE_TIMEOUT }),
]);
const digits = async (scope: Locator, selector: string) => (await scope.locator(selector).textContent())?.replace(/\D/g, "");

async function adminStep(r: Rehearsal, button: string, phase: string): Promise<boolean> {
  return r.check(`admin presses “${button}” and sees “${phase}”`, async () => {
    await r.admin.getByRole("button", { name: button, exact: true }).click();
    await expect(phaseOf(r)).toHaveText(phase);
  }, r.admin);
}

async function closesAt(r: Rehearsal, label: string, startedAt: number, timeout: number): Promise<void> {
  if (await r.check(label, () => expect(phaseOf(r)).toHaveText("Answers closed", { timeout }), r.admin)) {
    r.note(`${label}: ${((Date.now() - startedAt) / 1000).toFixed(1)} s after the question started.`);
  }
}

const questionRows = (r: Rehearsal) => r.admin.locator(".questions > ol > li");

// Staging and a reused instance keep the quiz between runs, and a quiz that is not locked hides the guest count the presence steps read.
async function clearQuiz(r: Rehearsal): Promise<void> {
  const reset = r.admin.getByRole("button", { name: "Reset quiz", exact: true });
  if (await reset.isEnabled()) {
    await reset.click();
    await r.admin.getByRole("button", { name: "Yes, reset quiz", exact: true }).click();
    await expect(phaseOf(r)).toHaveText("Locked");
  }
  for (let n = await questionRows(r).count(); n > 0; n--) {
    await questionRows(r).first().getByRole("button", { name: "Delete", exact: true }).click();
    await r.admin.getByRole("button", { name: "Delete question", exact: true }).click();
    await expect(questionRows(r)).toHaveCount(n - 1);
  }
}

const setup: Step = {
  id: "quiz-setup",
  title: "The host writes two placeholder questions; half the phones wait on the Quiz tab and half on Galleri",
  async run(r) {
    const leftovers = await questionRows(r).count();
    const phase = await phaseOf(r).textContent();
    if (leftovers || phase !== "Locked") {
      r.note(`The quiz was “${phase}” with ${leftovers} questions from an earlier run; the rehearsal reset it and deleted them.`);
      await r.check("admin clears the quiz left by an earlier run", () => clearQuiz(r), r.admin);
    }
    const photo = await placeholder(r.admin, LOOKS.snow);
    await r.check("admin adds a multiple-choice question with a photo", () =>
      addQuestion(r.admin, { ...CHOICE, options: [...CHOICE.options], photo }), r.admin);
    await r.check("admin adds a closest-number question", () =>
      addQuestion(r.admin, { ...NUMBER, answer: String(NUMBER.answer) }), r.admin);
    await r.check("admin lists both questions with the first up next", async () => {
      await expect(r.admin.locator(".questions > ol > li")).toHaveCount(2);
      await expect(r.admin.getByText(`Up next: question 1, “${CHOICE.text}”`)).toBeVisible();
    }, r.admin);
    await Promise.all(
      r.guests.map((g, i) =>
        r.check(`${g.name} ${i % 2 ? "waits on the locked Quiz tab" : "switches to Galleri"}`, async () => {
          if (i % 2) {
            await g.page.getByRole("button", { name: "Quiz", exact: true }).click();
            return expect(g.page.getByRole("heading", { name: "Quizet är inte öppet än" })).toBeVisible({ timeout: SEE_TIMEOUT });
          }
          await g.page.getByRole("button", { name: "Galleri" }).click();
          await expect(g.page.getByRole("heading", { name: "Galleri" })).toBeVisible({ timeout: SEE_TIMEOUT });
        }, g.page),
      ),
    );
  },
};

const unlock: Step = {
  id: "quiz-unlock",
  title: "The host unlocks the quiz; phones on Galleri get the popup and tap through, phones on Quiz see the lobby",
  async run(r) {
    await Promise.all([
      adminStep(r, "Unlock quiz", "Unlocked, waiting for the first question"),
      ...r.guests.map((g, i) =>
        i % 2
          ? r.time("unlock seen on the Quiz tab", g, async () => {
              await expect(g.page.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible({ timeout: SEE_TIMEOUT });
              await expect(unlockPopup(g.page)).toHaveCount(0);
            })
          : r.time("unlock popup", g, () => expect(unlockPopup(g.page)).toBeVisible({ timeout: SEE_TIMEOUT })).then(
              (ok) =>
                ok &&
                r.check(`${g.name} taps “Till quizet” and lands in the lobby`, async () => {
                  await unlockPopup(g.page).getByRole("button", { name: "Till quizet" }).click();
                  await expect(unlockPopup(g.page)).toBeHidden();
                  await expect(g.page.getByRole("button", { name: "Quiz", exact: true })).toHaveAttribute("aria-current", "page");
                  await expect(g.page.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();
                }, g.page),
            ),
      ),
    ]);
  },
};

// A phone holds its answer until the server confirms it, so a line that drops at once still ends with the pick kept.
type Drop = "after delivery" | "at once";
const DELIVERED_MS = 2_000;

// "at once" taps here and cuts the line straight away, before the server's confirmation can arrive.
async function dropAfterAnswer(r: Rehearsal, g: Guest, option: string, drop: Drop): Promise<void> {
  if (drop === "at once") await g.page.locator(".choice", { hasText: option }).click();
  else await g.page.waitForTimeout(DELIVERED_MS);
  await g.line.cut("clean");
  await r.check(`${g.name} shows “Återansluter…” after dropping ${drop}`, () => expect(reconnecting(g.page)).toBeVisible({ timeout: SEE_TIMEOUT }), g.page);
  await g.page.waitForTimeout(AWAY_MS);
  await g.line.restore();
  await r.time("back on the open question with its pick", g, async () => {
    await expect(reconnecting(g.page)).toHaveCount(0, { timeout: SEE_TIMEOUT });
    await expect(g.page.locator(".choice.picked")).toContainText(option, { timeout: SEE_TIMEOUT });
    await expect(g.page.getByText("Svar skickat!")).toBeVisible({ timeout: SEE_TIMEOUT });
  });
}

const choiceRound: Step = {
  id: "quiz-choice",
  title: "A photo question: every phone sees it, answers, a flaky phone joins it late and two drop after answering, one at once and one after its answer arrived; the last answer closes it early",
  async run(r) {
    const flaky = r.guests.filter((g) => g.profile === "flaky");
    const drops = new Map<Guest, Drop>([[flaky[0], "after delivery"], [flaky[1], "at once"]].filter((d): d is [Guest, Drop] => d[0] !== undefined));
    const late = flaky[2];
    const holdout = r.guests[0]!;
    const optionOf = (g: Guest) => CHOICE.options[choicePick(r, g)]!;

    if (late) await late.line.cut("clean");
    const startedAt = Date.now();
    await Promise.all([
      adminStep(r, "Start question 1", "Question open"),
      ...r.guests.map(async (g) => {
        if (g === late) {
          await g.page.waitForTimeout(AWAY_MS);
          await g.line.restore();
        }
        const kind = g === late ? "question 1 visible after reconnecting" : "question 1 (photo) visible";
        if (!(await r.time(kind, g, () => onQuestion(g.page, CHOICE.text, ".choices")))) return;
        if (g === holdout) return;
        const drop = drops.get(g);
        if (drop === "at once") return dropAfterAnswer(r, g, optionOf(g), drop);
        if (!(await r.time("answer sent", g, () => answer(g.page, optionOf(g))))) return;
        if (drop) await dropAfterAnswer(r, g, optionOf(g), drop);
      }),
    ]);
    const expected = allOnline(r);
    await r.check(`admin shows ${r.guests.length - 1} of ${expected} answered while one guest still thinks`, () =>
      expect(r.admin.getByText(`${r.guests.length - 1} of ${expected} answered`)).toBeVisible({ timeout: SEE_TIMEOUT }), r.admin);
    await r.time("answer sent", holdout, () => answer(holdout.page, optionOf(holdout)));
    const early = r.baselineOnline === 0;
    if (!early) r.note(`${r.baselineOnline} phones outside the cast are online, so question 1 closes at its deadline instead of early.`);
    await closesAt(r, early ? "answers close as soon as everyone has answered" : "answers close at the deadline", startedAt, early ? SEE_TIMEOUT : CHOICE.seconds * 1000 + GRACE_MS + SEE_TIMEOUT);
    await Promise.all(
      r.guests.map((g) =>
        r.check(`${g.name} waits for the answer with its own pick shown`, async () => {
          await expect(g.page.getByText("Väntar på rätt svar …")).toBeVisible({ timeout: SEE_TIMEOUT });
          await expect(g.page.getByText(`Ditt svar: ${LETTERS[choicePick(r, g)]}. ${optionOf(g)}`)).toBeVisible();
        }, g.page),
      ),
    );

    const right = r.guests.filter((g) => choicePick(r, g) === CHOICE.correct).length;
    await Promise.all([
      adminStep(r, "Reveal answer", "Answer revealed"),
      ...r.guests.map((g) => {
        const ok = choicePick(r, g) === CHOICE.correct;
        return r.time(ok ? "reveal shows Rätt!" : "reveal shows Tyvärr fel", g, async () => {
          await expect(g.page.getByRole("heading", { name: ok ? "Rätt!" : "Tyvärr fel" })).toBeVisible({ timeout: SEE_TIMEOUT });
          const points = Number((await digits(g.page.locator(".verdict"), ".points")) ?? NaN);
          expect(ok ? points >= 500 && points <= 1000 : points === 0, `${points} points`).toBe(true);
        });
      }),
    ]);
    await r.check(`admin counts ${right} right answers`, () => expect(r.admin.locator(".result.bars li.correct b")).toHaveText(String(right)), r.admin);
  },
};

const leaderboard: Step = {
  id: "quiz-leaderboard",
  title: "The leaderboard shows the top five on every phone and each guest's own row, matching the admin's board",
  async run(r) {
    const top = Math.min(5, r.guests.length);
    await Promise.all([
      adminStep(r, "Show leaderboard", "Leaderboard on phones"),
      ...r.guests.map((g) =>
        r.time("leaderboard with own row", g, async () => {
          await expect(g.page.getByRole("heading", { name: "Topplistan" })).toBeVisible({ timeout: SEE_TIMEOUT });
          await expect(g.page.locator(".lb:not(.mine) > li")).toHaveCount(top);
          const mine = g.page.locator(".lb .row.you");
          await expect(mine).toContainText(g.name);
          await expect(mine).toContainText("Du");
          const row = r.admin.locator("ol.board li").filter({ has: r.admin.getByText(g.name, { exact: true }) });
          expect(await digits(mine, ".rank")).toBe(await digits(row, ".rank"));
          expect(await digits(mine, ".score")).toBe(await digits(row, ".score"));
        }),
      ),
    ]);
    await r.check("admin marks question 1 as played and refuses to edit it", async () => {
      const first = r.admin.locator(".questions > ol > li").first();
      await expect(first).toContainText("Played");
      await expect(first.getByRole("button", { name: "Edit" })).toBeDisabled();
      await expect(first.getByRole("button", { name: "Delete" })).toBeDisabled();
    }, r.admin);
  },
};

const numberRound: Step = {
  id: "quiz-number",
  title: "A closest-number question: two guests let the clock run out, so it closes at the deadline plus grace",
  async run(r) {
    const silent = silentInRound2(r);
    const startedAt = Date.now();
    await Promise.all([
      adminStep(r, "Next question", "Question open"),
      ...r.guests.map(async (g) => {
        if (!(await r.time("question 2 (number) visible", g, () => onQuestion(g.page, NUMBER.text, ".guess")))) return;
        if (!silent.has(g)) await r.time("answer sent", g, () => answer(g.page, String(numberGuess(r, g))));
      }),
    ]);
    const answering = r.guests.filter((g) => !silent.has(g));
    await r.check(`admin shows ${answering.length} of ${allOnline(r)} answered and keeps the question open`, async () => {
      await expect(r.admin.getByText(`${answering.length} of ${allOnline(r)} answered`)).toBeVisible({ timeout: SEE_TIMEOUT });
      await expect(phaseOf(r)).toHaveText("Question open");
    }, r.admin);
    await closesAt(r, "answers close at the deadline plus grace", startedAt, NUMBER.seconds * 1000 + GRACE_MS + SEE_TIMEOUT);
    await Promise.all(
      [...silent].map((g) =>
        r.check(`${g.name} is told it ran out of time`, () => expect(g.page.getByText("Du hann inte svara den här gången.")).toBeVisible({ timeout: SEE_TIMEOUT }), g.page),
      ),
    );

    const off = (g: Guest) => Math.abs(numberGuess(r, g) - NUMBER.answer);
    const best = Math.min(...answering.map(off));
    const closest = answering.filter((g) => off(g) === best);
    await Promise.all([
      adminStep(r, "Reveal answer", "Answer revealed"),
      ...r.guests.map((g) => {
        const verdict = silent.has(g) ? "Inget svar" : off(g) === best ? "Närmast!" : "Inte närmast den här gången";
        return r.time(`reveal shows ${verdict}`, g, () => expect(g.page.getByRole("heading", { name: verdict })).toBeVisible({ timeout: SEE_TIMEOUT }));
      }),
    ]);
    await r.check(`admin names the ${closest.length} closest guessers`, () =>
      Promise.all(closest.map((g) => expect(r.admin.locator(".result")).toContainText(`${g.name} (${numberGuess(r, g)})`))), r.admin);
  },
};

const end: Step = {
  id: "quiz-end",
  title: "The host ends the quiz; every phone thanks the guest and goes back to Galleri, and the host resets the quiz for the next run",
  async run(r) {
    await Promise.all([
      adminStep(r, "End quiz", "Quiz ended"),
      ...r.guests.map(async (g) => {
        await r.time("quiz over", g, () => expect(g.page.getByRole("heading", { name: "Quizet är slut!" })).toBeVisible({ timeout: SEE_TIMEOUT }));
        await r.check(`${g.name} goes back to Galleri`, async () => {
          await g.page.getByRole("button", { name: "Galleri" }).click();
          await expect(g.page.getByRole("heading", { name: "Galleri" })).toBeVisible();
          await expect(greeting(g.page, g.name)).toBeVisible();
          await expect(unlockPopup(g.page)).toHaveCount(0);
        }, g.page);
      }),
    ]);
    await r.check("admin names the winner", () => expect(r.admin.locator(".winners")).toHaveText(/^(Winner|Joint winners): .+/), r.admin);
    await r.check("admin resets the quiz and deletes the rehearsal questions", () => clearQuiz(r), r.admin);
  },
};

export const quizSteps: Step[] = [setup, unlock, choiceRound, leaderboard, numberRound, end];
