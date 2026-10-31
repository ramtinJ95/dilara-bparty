import { describe, expect, it } from "vitest";
import type { AdminState } from "../src/shared/protocol";
import { answer, answerCmd, choice, closeAll, host, number, phone, phones, refused, revealPoints, stage, start, step, view, type Admin, type Phone } from "./support/quiz";
import { elapse, fireAlarm, joinedCookie } from "./support/worker";

async function round(admin: Admin, play: (q: Parameters<typeof answer>[1]) => Promise<void>, everyoneAnswers = true): Promise<void> {
  const q = await start(admin);
  await play(q);
  if (!everyoneAnswers) {
    await elapse(22_000);
    await fireAlarm();
  }
  await stage(admin, "closed");
}

async function quiz(names: string[], ...questions: Parameters<typeof host>): Promise<{ admin: Admin; players: Phone[] }> {
  const admin = await host(...questions);
  const players = await phones(...names);
  await step(admin, "unlock", "lobby");
  return { admin, players };
}

const done = (admin: Admin, players: Phone[]) => closeAll(admin, ...players.map((p) => p.socket));

describe("multiple choice points", () => {
  it("gives an instant correct answer 1000 and a wrong one 0", async () => {
    const { admin, players } = await quiz(["Astrid", "Olle"], choice());
    const [astrid, olle] = players as [Phone, Phone];
    await round(admin, async (q) => {
      await answer(astrid, q, 0, 0);
      await answer(olle, q, 1, 0);
    });
    expect(await revealPoints(admin, players)).toEqual({ Astrid: 1000, Olle: 0 });
    done(admin, players);
  });

  it("gives 750 for a correct answer at half the window", async () => {
    const { admin, players } = await quiz(["Astrid"], choice({ seconds: 20 }));
    await round(admin, async (q) => {
      await elapse(10_000);
      await answer(players[0]!, q, 0, 10_000);
    });
    expect(await revealPoints(admin, players)).toEqual({ Astrid: 750 });
    done(admin, players);
  });

  it("clamps a negative time to 0 and an over-reported time to the time since the phone got the question", async () => {
    const { admin, players } = await quiz(["Astrid", "Olle"], choice());
    const [astrid, olle] = players as [Phone, Phone];
    await round(admin, async (q) => {
      await answer(astrid, q, 0, -500);
      await answer(olle, q, 0, 99_999);
    });
    const points = await revealPoints(admin, players);
    expect(points["Astrid"]).toBe(1000);
    expect(points["Olle"]).toBeGreaterThanOrEqual(990);
    done(admin, players);
  });

  it("scores an answer in the grace period as the slowest and refuses one after it", async () => {
    const { admin, players } = await quiz(["Astrid", "Olle"], choice({ seconds: 20 }));
    const [astrid, olle] = players as [Phone, Phone];
    await round(
      admin,
      async (q) => {
        await elapse(21_000);
        await answer(astrid, q, 0, 21_000);
        await elapse(1_001);
        expect(await refused(olle, q, 0)).toBe("Svaret kom för sent.");
      },
      false,
    );
    expect(await revealPoints(admin, players)).toEqual({ Astrid: 500, Olle: 0 });
    done(admin, players);
  });
});

describe("closest number points", () => {
  it("gives every equally close guess 1000 and the rest 0", async () => {
    const { admin, players } = await quiz(["Astrid", "Olle", "Saga"], number({ answer: 42 }));
    const [astrid, olle, saga] = players as [Phone, Phone, Phone];
    await round(admin, async (q) => {
      await answer(astrid, q, 40, 15_000);
      await answer(olle, q, 44, 0);
      await answer(saga, q, 50, 0);
    });
    expect(await revealPoints(admin, players)).toEqual({ Astrid: 1000, Olle: 1000, Saga: 0 });
    const result = (await view(astrid, "reveal")).result;
    expect(result).toEqual({
      kind: "number",
      answer: 42,
      closest: expect.arrayContaining([
        { name: "Astrid", value: 40 },
        { name: "Olle", value: 44 },
      ]),
      guesses: 3,
    });
    expect(result.kind === "number" && result.closest).toHaveLength(2);
    done(admin, players);
  });
});

describe("board", () => {
  it("ranks ties together and keeps each player's rank from before the last round", async () => {
    const { admin, players } = await quiz(["Astrid", "Bosse", "Cilla"], choice(), choice({ text: "Fråga två", correct: 2 }));
    const [astrid, bosse, cilla] = players as [Phone, Phone, Phone];
    await round(admin, async (q) => {
      await answer(astrid, q, 0, -1);
      await answer(bosse, q, 1);
      await answer(cilla, q, 1);
    });
    await step(admin, "reveal", "reveal");
    await step(admin, "leaderboard", "leaderboard");
    const first = await view(cilla, "leaderboard");
    expect(first.top.map((r) => [r.name, r.score, r.rank, r.prev])).toEqual([
      ["Astrid", 1000, 1, 1],
      ["Bosse", 0, 2, 1],
      ["Cilla", 0, 2, 1],
    ]);

    await round(admin, async (q) => {
      await answer(astrid, q, 0);
      await answer(bosse, q, 2, -1);
      await answer(cilla, q, 1);
    });
    await step(admin, "reveal", "reveal");
    expect(await view(bosse, "reveal")).toMatchObject({ points: 1000, score: 1000, n: 2, total: 2 });
    await step(admin, "leaderboard", "leaderboard");
    const second = await view(cilla, "leaderboard");
    expect(second.top.map((r) => [r.name, r.score, r.rank, r.prev])).toEqual([
      ["Astrid", 1000, 1, 1],
      ["Bosse", 1000, 1, 2],
      ["Cilla", 0, 3, 2],
    ]);
    expect(second.you).toEqual({ id: cilla.id, name: "Cilla", score: 0, rank: 3, prev: 2 });
    done(admin, players);
  });

  it("shows phones the top five and their own row", async () => {
    const names = ["Alva", "Bror", "Cleo", "Dag", "Elsa", "Örjan"];
    const { admin, players } = await quiz(names, choice());
    await round(
      admin,
      async (q) => {
        for (const p of players.slice(0, 5)) await answer(p, q, 0, -1);
      },
      false,
    );
    await step(admin, "reveal", "reveal");
    await step(admin, "leaderboard", "leaderboard");
    const board = await view(players[5]!, "leaderboard");
    expect(board.top.map((r) => r.name)).toEqual(names.slice(0, 5));
    expect(board.you).toMatchObject({ name: "Örjan", score: 0, rank: 6 });
    done(admin, players);
  });

  it("names joint winners when the quiz ends on a tie for first", async () => {
    const { admin, players } = await quiz(["Astrid", "Olle", "Saga"], choice());
    const [astrid, olle, saga] = players as [Phone, Phone, Phone];
    await round(admin, async (q) => {
      await answer(astrid, q, 0, -1);
      await answer(olle, q, 0, -1);
      await answer(saga, q, 2);
    });
    await step(admin, "reveal", "reveal");
    expect((await admin.current()).quiz.winners).toEqual([]);
    await step(admin, "end", "ended");
    const ended: AdminState = await admin.current();
    expect([...ended.quiz.winners].sort()).toEqual([astrid.id, olle.id].sort());
    expect(await view(saga, "ended")).toEqual({ phase: "ended", unlockedAt: expect.any(Number) });
    done(admin, players);
  });

  it("counts merged duplicates once, with their best answer", async () => {
    const { admin, players } = await quiz(["Astrid", "Astrid igen"], choice());
    const [astrid, again] = players as [Phone, Phone];
    await round(admin, async (q) => {
      await answer(astrid, q, 1);
      await answer(again, q, 0, -1);
    });
    await step(admin, "reveal", "reveal");
    admin.send({ t: "merge", from: again.id, into: astrid.id });
    const merged = await admin.state((s) => s.players.length === 1);
    expect(merged.quiz.board).toEqual([{ id: astrid.id, name: "Astrid", score: 1000, rank: 1, prev: 1 }]);
    const followed = await again.socket.state((s) => s.you.id === astrid.id);
    expect(followed.quiz).toMatchObject({ phase: "reveal", pick: 0, points: 1000, score: 1000, result: { counts: [1, 0, 0] } });
    done(admin, players);
  });

  it("keeps the first answer of a player merged while the question is open", async () => {
    const { admin, players } = await quiz(["Astrid", "Astrid igen", "Olle"], choice());
    const [astrid, again] = players as [Phone, Phone, Phone];
    const q = await start(admin);
    await answer(again, q, 1);
    admin.send({ t: "merge", from: again.id, into: astrid.id });
    await astrid.socket.state((s) => s.quiz.phase === "open" && s.quiz.pick === 1);
    astrid.socket.send(await answerCmd(astrid, q, 0));
    expect((await astrid.socket.state()).quiz).toMatchObject({ phase: "open", pick: 1 });
    await elapse(22_000);
    await fireAlarm();
    expect((await revealPoints(admin, [astrid])).Astrid).toBe(0);
    done(admin, players);
  });

  it("times a merged player from the first phone that got the question", async () => {
    const astridCookie = await joinedCookie("Astrid");
    const { admin, players } = await quiz(["Astrid igen", "Olle"], choice());
    const [again] = players as [Phone, Phone];
    const q = await start(admin);
    await elapse(10_000);
    const astridId = (await admin.current()).players.find((p) => p.name === "Astrid")!.id;
    admin.send({ t: "merge", from: again.id, into: astridId });
    await admin.state((s) => s.players.length === 2);
    const astrid = await phone("Astrid", astridCookie);
    await answer(astrid, q, 0, 10_000);
    await elapse(22_000);
    await fireAlarm();
    const points = (await revealPoints(admin, [astrid])).Astrid!;
    expect(points).toBeGreaterThanOrEqual(745);
    expect(points).toBeLessThanOrEqual(750);
    done(admin, [...players, astrid]);
  });
});
