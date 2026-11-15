import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("client cannot open the coach pages", async ({ page }) => {
  await login(page, "avery");
  await page.goto("/coach");
  await expect(page).toHaveURL(/\/today/);
});

test("coach sees the week summary and can change targets", async ({ page }) => {
  await login(page, "morgan");
  await page.getByRole("link", { name: "Coach" }).click();
  await expect(page.getByRole("heading", { name: "Coach" })).toBeVisible();
  await expect(page.locator('[data-testid^="coach-day-"]')).toHaveCount(7);

  await page.getByTestId("target-kcal").fill("1650");
  await page.getByTestId("target-protein").fill("120");
  await page.getByTestId("target-save").click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(page.getByTestId("target-kcal")).toHaveValue("1650");
  await expect(page.getByTestId("target-protein")).toHaveValue("120");
});

test("coach edits the program: new routine, add and remove an exercise", async ({ page }) => {
  await login(page, "morgan");
  await page.goto("/coach/programs");
  await expect(page.getByText("Total Body")).toBeVisible();
  await page.getByRole("link", { name: /Total Body/ }).click();
  await expect(page).toHaveURL(/\/coach\/programs\/\d+/);
  await expect(page.getByTestId(/^routine-\d+$/)).toHaveCount(2);

  await page.getByTestId("new-routine-name").fill("Total Body C");
  await page.getByTestId("new-routine-submit").click();
  await expect(page.getByTestId(/^routine-\d+$/)).toHaveCount(3);

  const routine = page.getByTestId(/^routine-\d+$/).nth(2);
  await routine.getByTestId(/add-exercise$/).click();
  await page.getByTestId("exercise-name").fill("Goblet Squat");
  await page.getByTestId("exercise-save").click();
  await expect(routine.getByText("Goblet Squat")).toBeVisible();

  // Typing an unknown name creates a custom exercise.
  await routine.getByTestId(/add-exercise$/).click();
  await page.getByTestId("exercise-name").fill("Avery Special Lunge");
  await page.getByTestId("exercise-save").click();
  await expect(routine.getByText("Avery Special Lunge")).toBeVisible();

  // Removing takes two taps: the first arms the button, the second fires.
  await routine.getByRole("button", { name: "Edit Avery Special Lunge" }).click();
  await page.getByRole("button", { name: "Remove from routine" }).click();
  await page.getByRole("button", { name: "Tap again to remove" }).click();
  await expect(routine.getByText("Avery Special Lunge")).toHaveCount(0);

  // Deleting a routine confirms in a sheet whose button names the action.
  await routine.getByRole("button", { name: "Delete routine" }).click();
  const confirm = page.getByRole("dialog", { name: /^Delete "/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete routine" }).click();
  await expect(page.getByTestId(/^routine-\d+$/)).toHaveCount(2);
});
