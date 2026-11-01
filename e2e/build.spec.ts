import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_MARKER } from "../src/lab/fixture.ts";

// The Playwright web server has just run `vite build`, so dist/ is the production build.
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

test("the design lab is absent from the production build", async ({ request }) => {
  const built = files("dist");
  expect(built.some((f) => f.startsWith("dist/client/"))).toBe(true);
  expect(built.filter((f) => /lab/i.test(f.replace(/^dist\/dilara_bparty\//, "")))).toEqual([]);
  expect(built.filter((f) => /\.(woff2?|ttf|otf)$/.test(f))).toEqual([]);
  expect(built.filter((f) => readFileSync(f).includes(LAB_MARKER))).toEqual([]);
  for (const path of ["/lab/", "/lab/aurora", "/src/lab/index.html"]) expect((await request.get(path)).status(), path).toBe(404);
});
