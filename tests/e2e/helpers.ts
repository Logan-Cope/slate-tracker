import type { Page } from "@playwright/test";

export const PASSPHRASE = process.env.SITE_PASSPHRASE ?? "e2e-passphrase";

/** Signs in through the real login form as the given user handle. */
export async function login(page: Page, handle: "avery" | "morgan" = "avery") {
  await page.goto("/login");
  await page.getByRole("radio", { name: handle === "avery" ? "Avery" : "Morgan" }).check({ force: true });
  await page.getByTestId("passphrase").fill(PASSPHRASE);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/today");
}

/**
 * Counts user actions for the tap budgets in the spec. One action is a tap
 * (pointerdown) or one continuous entry into a field: typing "150" into one
 * input is one action, moving to another field and typing is another.
 * Install with `await counter.install()` BEFORE the first navigation.
 */
export class ActionCounter {
  taps = 0;
  entries = 0;
  private lastTypedTarget: string | null = null;

  constructor(private page: Page) {}

  async install() {
    await this.page.exposeBinding("__slateAction", (_src, kind: string, target: string) => {
      if (kind === "tap") {
        this.taps++;
        this.lastTypedTarget = null;
        return;
      }
      if (target !== this.lastTypedTarget) {
        this.entries++;
        this.lastTypedTarget = target;
      }
    });
    await this.page.addInitScript(() => {
      type Report = (kind: string, target: string) => void;
      const report = (kind: string, target: string) => (window as unknown as { __slateAction: Report }).__slateAction(kind, target);
      let seq = 0;
      const idOf = (el: Element | null) => {
        if (!el) return "none";
        const e = el as HTMLElement & { __slateId?: string };
        if (!e.__slateId) e.__slateId = `el${++seq}`;
        return e.__slateId;
      };
      window.addEventListener("pointerdown", () => report("tap", "tap"), true);
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key.length === 1 || e.key === "Backspace") report("type", idOf(document.activeElement));
          if (e.key === "Enter") report("tap", "enter");
        },
        true,
      );
    });
  }

  get total() {
    return this.taps + this.entries;
  }

  reset() {
    this.taps = 0;
    this.entries = 0;
    this.lastTypedTarget = null;
  }
}
