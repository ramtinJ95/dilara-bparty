import { test as base, type Locator } from "@playwright/test";

export { expect } from "@playwright/test";

// The actions that wait for their element to be stable, which takes two animation frames of its page.
const STABLE_ACTIONS = ["click", "dblclick", "tap", "check", "uncheck", "setChecked", "hover", "dragTo"] as const;

// WebKit can stop drawing frames for a page that is behind another, and an action on it then waits for stability until the test times out.
// So every such action first brings its page to the front, as a person looks at the screen they tap. Playwright exports no Locator class,
// so the patch reaches its prototype through a locator.
function frontBeforeActions(sample: Locator): void {
  const proto = Object.getPrototypeOf(sample) as Record<string, unknown> & { fronted?: true };
  if (proto.fronted) return;
  proto.fronted = true;
  for (const action of STABLE_ACTIONS) {
    const act = proto[action] as (this: Locator, ...args: unknown[]) => Promise<unknown>;
    proto[action] = async function (this: Locator, ...args: unknown[]) {
      await this.page().bringToFront();
      return act.apply(this, args);
    };
  }
}

export const test = base.extend<object, { front: void }>({
  front: [
    async ({ browser }, use) => {
      const page = await browser.newPage();
      frontBeforeActions(page.locator("body"));
      await page.close();
      await use();
    },
    { scope: "worker", auto: true },
  ],
});
