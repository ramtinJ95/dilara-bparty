#!/usr/bin/env node
import { expect, type Page } from "@playwright/test";
import { addQuestion, answer, forgetIdentity, greeting, heartbeatState, joinByLink, openAdmin, reconnecting, unlockPopup } from "../../../../../e2e/drive.ts";
import { LOOKS, placeholder, pngFile } from "../../../../../e2e/placeholder.ts";
import { openVerify, readSecrets, redact, repoRoot } from "../verify.ts";

const [baseUrl, out = `${repoRoot}artifacts/verify/quiz-finale-${Date.now()}`] = process.argv.slice(2);
if (!baseUrl) {
  console.error("Usage: node .claude/skills/verify-dilara-bparty/scripts/journeys/quiz-finale.ts <base-url> [evidence-dir]");
  process.exit(2);
}

const SEE = { timeout: 30_000 };
const CHOICE = { kind: "choice", text: "Hur många armar har snöflingan?", options: ["Sex armar", "Fyra armar"], correct: 0, seconds: 60 } as const;
const NUMBER = { kind: "number", text: "Hur många snöbollar ryms i en hink?", answer: "7", seconds: 15 } as const;

const secrets = readSecrets();
const tag = Math.random().toString(36).slice(2, 6);
const v = await openVerify(baseUrl, out);
// While a question waits, the Quiz tab's name is "Quiz En fråga väntar", so match its start.
const tab = (page: Page, name: "Quiz" | "Mitt foto" | "Galleri") => page.getByRole("navigation", { name: "Flikar" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
try {
  const admin = await v.laptop();
  await admin.setViewportSize({ width: 1440, height: 2400 });
  await openAdmin(admin, secrets.admin);
  const heartbeat = heartbeatState(admin);
  const phase = admin.locator(".quiz .phase");
  const quizFinale = admin.locator(".quiz-finale");
  const photoFinale = admin.locator(".photo-finale");
  await expect(heartbeat).toHaveText("Fast heartbeat off");

  const join = async (letter: string, profile: "good" | "bad-3g") => {
    const { page, line } = await v.phone(profile);
    const name = `Testgäst ${tag} ${letter}`;
    await joinByLink(page, secrets.join, name);
    await expect(greeting(page, name)).toBeVisible(SEE);
    return { page, line: line!, name };
  };
  const [a, b, c] = await Promise.all([join("A", "good"), join("B", "good"), join("C", "bad-3g")]);

  for (const [i, p] of [a, b].entries()) {
    await tab(p.page, "Mitt foto");
    await p.page.locator('input[type="file"]').setInputFiles(pngFile(`snow-${i}`, await placeholder(p.page, i ? LOOKS.dusk : LOOKS.snow)));
    await expect(p.page.getByText("Inga röster än")).toBeVisible(SEE);
  }
  await tab(c.page, "Galleri");
  for (const p of [a, b]) {
    const thumb = await admin.locator(".tally li").filter({ has: admin.locator(".name").getByText(p.name, { exact: true }) }).locator("img").getAttribute("src");
    await c.page.locator(".gallery .tile").filter({ has: c.page.locator(`img[src="${thumb}"]`) }).getByRole("button", { name: "Ge en röst" }).click();
    await expect(p.page.getByText("Din bild har 1 röst")).toBeVisible(SEE);
  }
  await expect(admin.locator(".tally .badge", { hasText: "tie" }).first()).toBeVisible();
  await v.evidence(admin, "01-admin-photo-tie");

  await admin.getByRole("button", { name: "+ Multiple choice" }).click();
  const editor = admin.locator(".questions form.editor");
  await editor.getByLabel("Question", { exact: true }).fill(CHOICE.text);
  await editor.getByLabel("Option A", { exact: true }).fill(CHOICE.options[0]);
  await expect(editor.getByText("Fill in every option.")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Save question" })).toBeDisabled();
  await editor.getByRole("button", { name: "Cancel" }).click();
  await addQuestion(admin, { ...CHOICE, options: [...CHOICE.options], photo: await placeholder(admin, LOOKS.snow) });
  await addQuestion(admin, NUMBER);
  await expect(admin.getByText(`Up next: question 1, “${CHOICE.text}”`)).toBeVisible();

  await tab(a.page, "Quiz");
  await tab(b.page, "Galleri");
  await admin.getByRole("button", { name: "Unlock quiz", exact: true }).click();
  await expect(phase).toHaveText("Unlocked, waiting for the first question");
  await expect(heartbeat).toHaveText("Fast heartbeat on");
  await expect(heading(a.page, "Quizet börjar snart!")).toBeVisible(SEE);
  await expect(unlockPopup(a.page)).toHaveCount(0);
  await expect(unlockPopup(b.page)).toBeVisible(SEE);
  await v.evidence(b.page, "02-phone-unlock-popup");
  await unlockPopup(b.page).getByRole("button", { name: "Till quizet" }).click();
  await expect(b.page.getByRole("button", { name: "Quiz", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(unlockPopup(c.page)).toBeVisible(SEE);
  await unlockPopup(c.page).getByRole("button", { name: "Inte nu" }).click();
  await expect(unlockPopup(c.page)).toBeHidden();

  await admin.getByRole("button", { name: "Start question 1", exact: true }).click();
  await expect(phase).toHaveText("Question open");
  await expect(c.page.getByLabel("En fråga väntar")).toBeVisible(SEE);
  await v.evidence(c.page, "03-phone-quiz-dot");
  await tab(c.page, "Quiz");
  for (const p of [a, b, c]) await expect(heading(p.page, CHOICE.text)).toBeVisible(SEE);
  await v.evidence(c.page, "04-phone-question-bad-3g");
  await answer(a.page, "Sex armar");
  // B answers last, so the round is still open while C is away; a round whose last answerer drops is revealed without them.
  await c.page.locator(".choice", { hasText: "Sex armar" }).click();
  await c.line.cut("clean");
  await expect(reconnecting(c.page)).toBeVisible(SEE);
  await c.line.restore();
  await expect(reconnecting(c.page)).toHaveCount(0, SEE);
  await expect(c.page.locator(".choice.picked")).toContainText("Sex armar");
  await expect(c.page.getByText("Svar skickat!")).toBeVisible(SEE);
  await answer(b.page, "Fyra armar");
  await expect(phase, "the last answer reveals at once").toHaveText("Answer revealed", SEE);
  await expect(admin.getByText("The leaderboard follows on its own in a few seconds.")).toBeVisible();
  await expect(heading(a.page, "Rätt!")).toBeVisible(SEE);
  await expect(heading(b.page, "Tyvärr fel")).toBeVisible(SEE);
  await expect(heading(c.page, "Rätt!")).toBeVisible(SEE);
  await v.evidence(a.page, "04-phone-reveal-right");
  await expect(phase, "the leaderboard follows on its own").toHaveText("Leaderboard on phones", SEE);
  for (const p of [a, b, c]) {
    await expect(heading(p.page, "Topplistan")).toBeVisible(SEE);
    await expect(p.page.locator(".lb .row.you")).toContainText(p.name);
  }
  await v.evidence(b.page, "05-phone-leaderboard");

  await admin.getByRole("button", { name: "Next question", exact: true }).click();
  for (const p of [a, b, c]) await expect(heading(p.page, NUMBER.text)).toBeVisible(SEE);
  await answer(a.page, "7");
  await answer(b.page, "3");
  await expect(admin.getByText("2 of 3 answered")).toBeVisible(SEE);
  await admin.getByRole("button", { name: "Reveal answer", exact: true }).click();
  await expect(admin.getByText("Close answers now? 1 guest hasn't answered.")).toBeVisible();
  await v.evidence(admin, "05-admin-early-reveal");
  await admin.getByRole("button", { name: "Yes, reveal answer", exact: true }).click();
  await expect(phase, "the host cuts the question short").toHaveText("Answer revealed");
  await expect(heading(a.page, "Närmast!")).toBeVisible(SEE);
  await expect(heading(b.page, "Inte närmast den här gången")).toBeVisible(SEE);
  await expect(heading(c.page, "Inget svar")).toBeVisible(SEE);
  await admin.getByRole("button", { name: "Show leaderboard", exact: true }).click();
  await expect(phase, "the host skips the wait").toHaveText("Leaderboard on phones");
  for (const p of [a, b, c]) await expect(heading(p.page, "Topplistan")).toBeVisible(SEE);

  await admin.getByRole("button", { name: "End quiz", exact: true }).click();
  await expect(phase).toHaveText("Quiz ended");
  await expect(admin.locator(".winners")).toHaveText(`Winner: ${a.name}`);
  await expect(heartbeat).toHaveText("Fast heartbeat off");
  for (const p of [a, b, c]) await expect(heading(p.page, "Quizet är slut!")).toBeVisible(SEE);
  await v.evidence(admin, "06-admin-quiz-ended");

  const backToParty = async (show: "Quiz" | "Galleri") => {
    for (const p of [a, b, c]) {
      await p.page.getByRole("button", { name: "Tillbaka till festen" }).click();
      await expect(greeting(p.page, p.name)).toBeVisible(SEE);
      await tab(p.page, show);
    }
  };

  await quizFinale.getByRole("button", { name: "Open suspense page" }).click();
  await quizFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  await expect(quizFinale.locator(".phase")).toHaveText("Suspense page on phones");
  for (const p of [a, b, c]) await expect(heading(p.page, "Vem vann quizet?")).toBeVisible(SEE);
  await expect(admin.getByText("Voting open"), "the quiz finale leaves the photo contest open").toBeVisible();
  await expect(admin.getByRole("button", { name: "Reset quiz", exact: true })).toBeDisabled();
  await expect(heartbeat).toHaveText("Fast heartbeat on");
  await v.evidence(a.page, "07-phone-quiz-suspense");

  await quizFinale.getByRole("button", { name: "Reveal quiz winner" }).click();
  await expect(quizFinale.locator(".phase")).toHaveText("Winner on phones");
  for (const p of [a, b, c]) {
    await expect(p.page.getByText("Quizvinnaren", { exact: true })).toBeVisible(SEE);
    await expect(p.page.getByText("Grattis, du vann!")).toHaveCount(p === a ? 1 : 0);
  }
  await v.evidence(a.page, "08-phone-quiz-winner");
  await backToParty("Quiz");
  for (const p of [a, b, c]) await expect(p.page.locator(".quiz-winners"), "the Quiz tab keeps the winner").toContainText(a.name);
  await v.evidence(a.page, "08b-phone-quiz-tab-winner");

  await photoFinale.getByRole("button", { name: "Open suspense page" }).click();
  await photoFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  for (const p of [a, b, c]) await expect(heading(p.page, "Vem tog bästa fotot?")).toBeVisible(SEE);
  await expect(admin.getByText("Voting closed")).toBeVisible();
  await expect(admin.getByText("Uploads closed")).toBeVisible();
  await expect(photoFinale.getByRole("button", { name: "Reveal photo winner" })).toBeDisabled();
  await expect(photoFinale.getByText("Photos are tied for first. Pick the winner before you reveal it.")).toBeVisible();
  await photoFinale.locator(".tie-photos").getByRole("button", { name: "Pick as winner" }).first().click();
  await expect(photoFinale.getByRole("button", { name: "Winner ✓" })).toBeVisible();
  await v.evidence(admin, "09-admin-tie-picked");
  await photoFinale.getByRole("button", { name: "Reveal photo winner" }).click();
  await expect(photoFinale.locator(".phase")).toHaveText("Winner on phones");
  const photographer = (await photoFinale.locator(".revealed dd b").textContent())!;
  for (const p of [a, b, c]) {
    await expect(heading(p.page, photographer)).toBeVisible(SEE);
    await expect(p.page.getByText("Grattis, det är din bild!")).toHaveCount(p.name === photographer ? 1 : 0);
    await expect(p.page.locator(".recap"), "the quiz winner stays as a recap").toHaveText(`Quizvinnaren${a.name}`);
  }
  await c.line.cut("clean");
  await expect(reconnecting(c.page)).toBeVisible(SEE);
  await c.line.restore();
  await expect(reconnecting(c.page)).toHaveCount(0, SEE);
  await expect(heading(c.page, photographer)).toBeVisible();
  const winnerPhone = [a, b].find((p) => p.name === photographer)!;
  await expect(winnerPhone.page.locator(".win-photo img.full.loaded")).toBeVisible(SEE);
  await v.evidence(winnerPhone.page, "10-phone-photo-winner");
  await backToParty("Galleri");
  for (const p of [a, b, c]) await expect(p.page.locator(".photo-winner"), "the gallery shows the winner").toContainText(photographer);
  await v.evidence(c.page, "10b-phone-gallery-winner");

  const end = admin.locator(".party-end");
  await end.getByRole("button", { name: "End the party" }).click();
  await end.getByRole("button", { name: "Yes, end the party" }).click();
  await expect(end.getByText("The party has ended. New guests can't join.")).toBeVisible();
  const { page: late } = await v.phone();
  await joinByLink(late, secrets.join, `Testgäst ${tag} sen`);
  await expect(late.getByText("Kalaset är slut. Tack för att du var med!")).toBeVisible(SEE);
  await v.evidence(late, "11-phone-party-ended");
  await forgetIdentity(b.page);
  await joinByLink(b.page, secrets.join, b.name.toLowerCase());
  await expect(heading(b.page, "Är det du?")).toBeVisible(SEE);
  await b.page.getByRole("button", { name: "Ja, det är jag" }).click();
  // A fresh page lands on the photo reveal for the rest of its minute, and in the app after that.
  await expect(heading(b.page, photographer).or(greeting(b.page, b.name))).toBeVisible(SEE);

  await end.getByRole("button", { name: "Wipe all data…" }).click();
  await expect(end.getByText(/^Download the photos first!/)).toBeVisible();
  await expect(end.getByRole("button", { name: /^Download all \(zip, 2\)$/ })).toBeVisible();
  await v.evidence(admin, "12-admin-wipe-confirm");
  await end.getByRole("button", { name: "Yes, wipe everything" }).click();
  await expect(admin.locator("#players-title")).toContainText(/^Players\s*0/, SEE);
  for (const p of [a, b, c]) await expect(p.page).toHaveURL(/\/$/, SEE);
  await expect(end.getByText("New guests can join.")).toBeVisible();
  await v.evidence(c.page, "13-phone-after-wipe");

  console.log(`PASS quiz-finale: an automatic and an early round, the quiz finale, the photo finale with a tie, a drop on bad 3G, each phone back in the party with the winners, the end of the party and the wipe, with the heartbeat following the quiz and the finale. Evidence: ${out}`);
} catch (e) {
  console.error(`FAIL quiz-finale: ${redact(String(e instanceof Error ? e.message : e), secrets)}\nEvidence so far: ${out}`);
  process.exitCode = 1;
} finally {
  await v.close();
}
