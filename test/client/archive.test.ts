import { describe, expect, it } from "vitest";
import { archiveFiles } from "../../src/client/admin/archive";
import type { PhotoId, PlayerId } from "../../src/shared/model";
import type { AdminEntrant, AdminVersion } from "../../src/shared/protocol";

const version = (id: string, createdAt: number, rest: Partial<AdminVersion> = {}): AdminVersion => ({
  id: id as PhotoId,
  thumb: `${id}t` as PhotoId,
  status: "current",
  hidden: false,
  inGallery: true,
  votes: 0,
  createdAt,
  ...rest,
});
const entrant = (name: string, versions: AdminVersion[]): AdminEntrant => ({ player: name as PlayerId, name, versions });

describe("archiveFiles", () => {
  it("numbers each guest's versions oldest first and says what became of them", () => {
    const files = archiveFiles([
      entrant("Astrid", [
        version("c", 30),
        version("a", 10, { status: "replaced", inGallery: false }),
        version("b", 20, { status: "replaced", inGallery: true, votes: 2 }),
      ]),
      entrant("Kim", [version("d", 5, { status: "removed", inGallery: false }), version("e", 40, { hidden: true, inGallery: false })]),
    ]);
    expect(files.map((f) => [f.id, f.stem])).toEqual([
      ["a", "Astrid - 1 (replaced)"],
      ["b", "Astrid - 2 (hall of fame)"],
      ["c", "Astrid - 3"],
      ["d", "Kim - 1 (removed)"],
      ["e", "Kim - 2 (hidden)"],
    ]);
  });

  it("makes names safe for file systems and keeps them unique", () => {
    const files = archiveFiles([entrant("A/B", [version("a", 1)]), entrant("A:B", [version("b", 1)]), entrant("...", [version("c", 1)]), entrant("Åsa Ö", [version("d", 1)])]);
    expect(files.map((f) => f.stem)).toEqual(["A_B - 1", "A_B - 1 (2)", "Guest - 1", "Åsa Ö - 1"]);
  });
});
