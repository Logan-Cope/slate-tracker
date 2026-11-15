import { expect, test, type Locator, type Page } from "@playwright/test";
import { ActionCounter, login } from "./helpers";

/**
 * One workout, start to finish, as Avery would do it in the gym. The tests
 * share the database the dev server seeds, so they run in order; each one
 * signs in fresh and resumes the open workout from /train.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const WORKOUT_URL = /\/train\/workout\/[0-9a-f-]{36}$/;

async function openTrain(page: Page) {
  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "Train", exact: true })).toBeVisible();
}

async function resumeWorkout(page: Page) {
  await page.getByTestId("resume-workout").click();
  await page.waitForURL(WORKOUT_URL);
}

function exerciseCard(page: Page, index: number): Locator {
  return page.getByTestId(/^exercise-/).nth(index);
}

/** Set ids of a card, in row order, read off the weight inputs' test ids. */
async function setIds(card: Locator): Promise<string[]> {
  const weights = card.getByTestId(/^set-.*-weight$/);
  await expect(weights.first()).toBeVisible();
  const ids: string[] = [];
  for (let i = 0; i < (await weights.count()); i++) {
    const tid = (await weights.nth(i).getAttribute("data-testid")) ?? "";
    ids.push(tid.slice("set-".length, -"-weight".length));
  }
  return ids;
}

test("(a) Total Body A is up next; Start opens it with Hip Thrust first and the ghost weight 95", async ({ page }) => {
  await login(page);
  await openTrain(page);
  const upNext = page.getByTestId("up-next");
  await expect(upNext).toContainText("Total Body A");

  await upNext.getByTestId(/^start-routine-/).click();
  await page.waitForURL(WORKOUT_URL);

  const first = exerciseCard(page, 0);
  await expect(first).toContainText("Hip Thrust Machine");
  const [set1] = await setIds(first);
  const weight = page.getByTestId(`set-${set1}-weight`);
  await expect(weight).toHaveAttribute("placeholder", "95");
  await expect(weight).toHaveValue("");
});

test("(b) one tap logs a set equal to the ghost, and the rest timer starts", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page);
  await openTrain(page);
  await resumeWorkout(page);

  const first = exerciseCard(page, 0);
  const [set1] = await setIds(first);
  const check = page.getByTestId(`set-${set1}-check`);
  await expect(check).toHaveAttribute("aria-pressed", "false");

  counter.reset();
  await check.click();

  await expect(check).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`set-${set1}-weight`)).toHaveValue("95");
  await expect.poll(() => counter.total).toBe(1);
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");
});

test("(c) typed values complete a set, and PR badges appear on the record sets", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await resumeWorkout(page);

  const first = exerciseCard(page, 0);
  const [set1, set2] = await setIds(first);
  await page.getByTestId(`set-${set2}-weight`).fill("110");
  await page.getByTestId(`set-${set2}-reps`).fill("12");
  await page.getByTestId(`set-${set2}-check`).click();
  await expect(page.getByTestId(`set-${set2}-check`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`set-${set2}-pr`)).toBeVisible();

  // Set 1 was logged with the start weight and no reps, so it could not score yet.
  // Adding its reps re-evaluates the completed set: with no history it is a record too.
  await expect(page.getByTestId(`set-${set1}-pr`)).toHaveCount(0);
  await page.getByTestId(`set-${set1}-reps`).fill("12");
  await expect(page.getByTestId(`set-${set1}-pr`)).toBeVisible();
  await expect(page.getByTestId(`set-${set2}-pr`)).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");
});

test("(d) a reload mid-workout keeps every completed set, even one not yet saved", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await resumeWorkout(page);

  const first = exerciseCard(page, 0);
  const [set1, set2] = await setIds(first);
  await expect(page.getByTestId(`set-${set1}-check`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`set-${set2}-check`)).toHaveAttribute("aria-pressed", "true");

  // Complete a set on the second exercise and reload before the debounced save can run.
  const second = exerciseCard(page, 1);
  const [other] = await setIds(second);
  await page.getByTestId(`set-${other}-check`).click();
  await expect(page.getByTestId(`set-${other}-check`)).toHaveAttribute("aria-pressed", "true");
  await page.reload();

  await expect(page.getByTestId(`set-${set1}-check`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`set-${set2}-weight`)).toHaveValue("110");
  await expect(page.getByTestId(`set-${other}-check`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");

  // Undo it again so the finished workout has exactly the two Hip Thrust sets.
  await page.getByTestId(`set-${other}-check`).click();
  await expect(page.getByTestId(`set-${other}-check`)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");
});

test("(e) Finish shows the summary, then Train lists the workout and moves on to Total Body B", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await resumeWorkout(page);

  await page.getByTestId("finish-workout").click();
  await page.getByTestId("confirm-finish").click();
  await page.waitForURL(/\/train\/workout\/[0-9a-f-]{36}\/summary$/);
  await expect(page.getByTestId("summary-sets")).toHaveText("2");
  await expect(page.getByTestId("summary-prs")).toHaveText("2");

  await page.getByTestId("summary-done").click();
  await page.waitForURL(/\/train$/);
  await expect(page.getByTestId("resume-workout")).toHaveCount(0);
  await expect(page.getByTestId("recent-workouts")).toContainText("Total Body A");
  await expect(page.getByTestId("recent-workouts")).toContainText("2 sets");
  await expect(page.getByTestId("up-next")).toContainText("Total Body B");
});

test("(f) the rest timer appears after a set, counts down from 60 s and can be skipped", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await page.getByTestId("up-next").getByTestId(/^start-routine-/).click();
  await page.waitForURL(WORKOUT_URL);

  const first = exerciseCard(page, 0);
  await expect(first).toContainText("Leg Press");
  const [set1] = await setIds(first);
  await expect(page.getByTestId("rest-timer")).toHaveCount(0);
  await page.getByTestId(`set-${set1}-check`).click();

  const timer = page.getByTestId("rest-timer");
  await expect(timer).toBeVisible();
  await expect(timer).toContainText(/1:00|0:5\d/);
  await timer.getByRole("button", { name: "Skip" }).click();
  await expect(timer).toHaveCount(0);
});

test("(g) an abandoned workout can be discarded: Train shows no Resume and the local copy is gone", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await resumeWorkout(page);
  const workoutId = page.url().split("/").pop() ?? "";

  // Discard lives behind the header's overflow menu, never a stray tap away.
  const options = page.getByRole("button", { name: "Workout options" });
  await options.click();
  await page.getByTestId("discard-workout").click();
  const discard = page.getByRole("dialog", { name: "Discard this workout?" });
  await expect(discard).toBeVisible();

  // Backing out returns focus to the button that started the chain, not to the menu that closed on the way.
  await discard.getByRole("button", { name: "Keep going" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(options).toBeFocused();

  await options.click();
  await page.getByTestId("discard-workout").click();
  await expect(discard).toBeVisible();
  await page.getByTestId("confirm-discard").click();

  await page.waitForURL(/\/train$/);
  await expect(page.getByTestId("resume-workout")).toHaveCount(0);
  await expect(page.getByTestId("up-next")).toBeVisible();
  const stored = await page.evaluate((id) => localStorage.getItem(`slate-workout-${id}`), workoutId);
  expect(stored).toBeNull();

  // a reload must not resurrect it from the server either
  await page.reload();
  await expect(page.getByTestId("resume-workout")).toHaveCount(0);
  await expect(page.getByTestId("recent-workouts")).not.toContainText("Total Body B");
});

test("(h) Discard on the Resume card removes the open workout without opening it", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await page.getByTestId("up-next").getByTestId(/^start-routine-/).click();
  await page.waitForURL(WORKOUT_URL);
  const workoutId = page.url().split("/").pop() ?? "";

  await openTrain(page);
  await expect(page.getByTestId("resume-workout")).toBeVisible();
  await page.getByTestId("resume-discard").click();
  await expect(page.getByRole("dialog", { name: "Discard this workout?" })).toBeVisible();
  await page.getByTestId("confirm-discard").click();

  await expect(page.getByTestId("resume-workout")).toHaveCount(0);
  await expect(page.getByTestId("up-next")).toBeVisible();
  const stored = await page.evaluate((id) => localStorage.getItem(`slate-workout-${id}`), workoutId);
  expect(stored).toBeNull();

  await page.reload();
  await expect(page.getByTestId("resume-workout")).toHaveCount(0);
  await expect(page.getByTestId("recent-workouts")).not.toContainText("Total Body B");
});

test("(i) a set or an exercise removed from the menu comes back with Undo, in its old place", async ({ page }) => {
  await login(page);
  await openTrain(page);
  await page.getByTestId("up-next").getByTestId(/^start-routine-/).click();
  await page.waitForURL(WORKOUT_URL);

  const first = exerciseCard(page, 0);
  await expect(first).toContainText("Leg Press");
  const [set1, set2] = await setIds(first);
  await page.getByTestId(`set-${set2}-weight`).fill("200");
  const cards = page.getByTestId(/^exercise-/);
  const cardCount = await cards.count();
  const toast = page.getByTestId("toast");

  // Every set has its own menu row, named the way the row shows it.
  await first.getByRole("button", { name: /options$/ }).click();
  const removeRow = page.getByTestId(`remove-set-${set2}`);
  await expect(removeRow).toHaveText("Remove set 2 (to failure)");
  await removeRow.click();
  await expect(page.getByTestId(`set-${set2}-weight`)).toHaveCount(0);
  expect(await setIds(first)).toEqual([set1]);

  // The toast names the set the way the row does, type and all.
  await expect(toast).toContainText("Set 2 (to failure) removed");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId(`set-${set2}-weight`)).toHaveValue("200");
  expect(await setIds(first)).toEqual([set1, set2]);

  // The whole exercise, same deal: it returns to the front with both sets.
  await first.getByRole("button", { name: /options$/ }).click();
  await page.getByRole("button", { name: "Remove exercise" }).click();
  await expect(cards).toHaveCount(cardCount - 1);
  await expect(exerciseCard(page, 0)).toContainText("Calf Raise Machine");

  await expect(toast).toContainText("Leg Press removed");
  // Logging a set no longer throws the Undo away: the toast moves above the rest timer and waits.
  const [calfSet] = await setIds(exerciseCard(page, 0));
  await page.getByTestId(`set-${calfSet}-check`).click();
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  await expect(toast).toContainText("Leg Press removed");
  await page.getByTestId("rest-timer").getByRole("button", { name: "Skip" }).click();
  await page.getByTestId(`set-${calfSet}-check`).click();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(cards).toHaveCount(cardCount);
  await expect(exerciseCard(page, 0)).toContainText("Leg Press");
  expect(await setIds(exerciseCard(page, 0))).toEqual([set1, set2]);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");

  // Leave Train the way the test found it.
  await page.getByRole("button", { name: "Workout options" }).click();
  await page.getByTestId("discard-workout").click();
  await page.getByTestId("confirm-discard").click();
  await page.waitForURL(/\/train$/);
  await expect(page.getByTestId("resume-workout")).toHaveCount(0);
});
