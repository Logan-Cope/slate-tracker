/** Demo mode: one-tap sign-in, synthetic history, fixture readers in place of model calls. */
export function isDemo(): boolean {
  return process.env.DEMO_MODE === "1";
}
