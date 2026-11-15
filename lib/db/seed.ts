/**
 * Idempotent seed: the athlete's profile, the two users (an athlete and a
 * coach), starting targets, the exercise library and a starter program
 * (Total Body A / B). Every name and number here is invented.
 *
 * Runs from `npm run db:seed` and automatically on an empty PGlite database.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { exercises, foods, profiles, programs, routineExercises, routines, targets, users } from "./schema";
import { EXERCISE_LIBRARY } from "@/lib/training/exercise-library";

const REP_SCHEME = "Set 1: 8-12 · Set 2: to failure";
const TEMPO = "2-1-2-0";

type SeedExercise = { name: string; startWeightLb: number | null; coachNote?: string; targetSets?: number };

const TOTAL_BODY_A: SeedExercise[] = [
  { name: "Hip Thrust Machine", startWeightLb: 95 },
  { name: "Incline Dumbbell Press", startWeightLb: 20 },
  { name: "Row Machine", startWeightLb: 70 },
  { name: "Leg Extension", startWeightLb: 90 },
  { name: "Dumbbell Biceps Curl", startWeightLb: 15, coachNote: "Elbows pinned. Slow on the way down." },
];

const TOTAL_BODY_B: SeedExercise[] = [
  { name: "Leg Press", startWeightLb: 160 },
  { name: "Calf Raise Machine", startWeightLb: 110 },
  { name: "Seated Cable Row", startWeightLb: 65 },
  { name: "Dumbbell Romanian Deadlift", startWeightLb: 30, coachNote: "Hinge at the hips, flat back." },
  { name: "Ab Machine", startWeightLb: null },
];

const PROGRAM_NOTES = [
  "Two working sets per exercise. The second goes to failure.",
  "Pick a weight that has you failing between 8 and 12 reps.",
  "When set 1 reaches 12 clean reps, add weight next session.",
  "Tempo 2-1-2-0: two seconds up, one second hold, two seconds down.",
  "Rest about 60 s between sets.",
].join("\n");

export type SeedLog = (msg: string) => void;

export async function seed(db: Database, log: SeedLog = () => undefined): Promise<void> {
  // Profile
  let avery = (await db.select().from(profiles).where(eq(profiles.name, "Avery")).limit(1))[0];
  if (!avery) {
    [avery] = await db.insert(profiles).values({ name: "Avery", weightUnit: "lb" }).returning();
    log("Created profile Avery");
  }
  if (!avery) throw new Error("profile insert failed");

  // Users
  const wantUsers = [
    { handle: "avery", name: "Avery", email: null as string | null, role: "client" as const },
    { handle: "morgan", name: "Morgan", email: null as string | null, role: "coach" as const },
  ];
  for (const u of wantUsers) {
    const existing = await db.select().from(users).where(eq(users.handle, u.handle)).limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({ ...u, defaultProfileId: avery.id });
      log(`Created user ${u.handle} (${u.role})`);
    }
  }

  // Targets: placeholder until the coach sets real numbers.
  const existingTargets = await db.select().from(targets).where(eq(targets.profileId, avery.id)).limit(1);
  if (existingTargets.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(targets).values({ profileId: avery.id, kcal: 1500, proteinG: 100, effectiveFrom: today });
    log("Created placeholder targets 1500 kcal / 100 g protein");
  }

  // Exercise library
  const existingNames = new Set((await db.select({ name: exercises.name }).from(exercises)).map((e) => e.name));
  const missing = EXERCISE_LIBRARY.filter((e) => !existingNames.has(e.name));
  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i += 200) {
      await db.insert(exercises).values(
        missing.slice(i, i + 200).map((e) => ({
          name: e.name,
          kind: e.kind,
          primaryMuscle: e.muscle,
          equipment: e.equipment,
        })),
      );
    }
    log(`Inserted ${missing.length} exercises`);
  }

  // Program
  const existingProgram = await db
    .select()
    .from(programs)
    .where(and(eq(programs.profileId, avery.id), eq(programs.name, "Total Body")))
    .limit(1);
  if (existingProgram.length === 0) {
    const [program] = await db
      .insert(programs)
      .values({ profileId: avery.id, name: "Total Body", notes: PROGRAM_NOTES, isActive: true })
      .returning();
    if (!program) throw new Error("program insert failed");

    const allNames = [...TOTAL_BODY_A, ...TOTAL_BODY_B].map((e) => e.name);
    const rows = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(inArray(exercises.name, allNames));
    const idByName = new Map(rows.map((r) => [r.name, r.id]));

    const routineDefs: [string, SeedExercise[]][] = [
      ["Total Body A", TOTAL_BODY_A],
      ["Total Body B", TOTAL_BODY_B],
    ];
    for (const [idx, [name, list]] of routineDefs.entries()) {
      const [routine] = await db.insert(routines).values({ programId: program.id, name, position: idx }).returning();
      if (!routine) throw new Error("routine insert failed");
      await db.insert(routineExercises).values(
        list.map((e, position) => {
          const exerciseId = idByName.get(e.name);
          if (!exerciseId) throw new Error(`Exercise missing from library: ${e.name}`);
          return {
            routineId: routine.id,
            exerciseId,
            position,
            targetSets: e.targetSets ?? 2,
            repScheme: REP_SCHEME,
            tempo: TEMPO,
            restSeconds: 60,
            coachNote: e.coachNote ?? null,
            startWeightLb: e.startWeightLb,
          };
        }),
      );
    }
    log("Created program Total Body with routines A and B");
  }
}

/**
 * A second client profile for end-to-end tests, so the coach's profile switch has
 * somewhere to go. Only used when E2E=1.
 */
export async function seedTestProfiles(db: Database): Promise<void> {
  const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.name, "Sam")).limit(1);
  if (existing.length === 0) await db.insert(profiles).values({ name: "Sam", weightUnit: "lb" });
}

/**
 * A small food set for end-to-end tests, so flows can be exercised without the
 * USDA import. Only used when E2E=1.
 */
export async function seedTestFoods(db: Database, log: SeedLog = () => undefined): Promise<void> {
  const existing = await db.select({ id: foods.id }).from(foods).limit(1);
  if (existing.length > 0) return;
  await db.insert(foods).values([
    { source: "fdc_sr", fdcId: 900001, name: "Chicken breast, cooked, roasted", servingLabel: "100 g", servingGrams: 100, kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    { source: "fdc_sr", fdcId: 900002, name: "Egg, whole, cooked, scrambled", servingLabel: "100 g", servingGrams: 100, kcal: 149, proteinG: 10, carbsG: 1.6, fatG: 11 },
    { source: "fdc_sr", fdcId: 900003, name: "Rice, white, cooked", servingLabel: "100 g", servingGrams: 100, kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
    { source: "fdc_sr", fdcId: 900004, name: "Banana, raw", servingLabel: "100 g", servingGrams: 100, kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3 },
    { source: "fdc_branded", fdcId: 900005, upc: "818290014580", name: "Greek Yogurt, Plain, Nonfat", brand: "Chobani", servingLabel: "1 container (150 g)", servingGrams: 150, kcal: 80, proteinG: 15, carbsG: 6, fatG: 0 },
    { source: "fdc_branded", fdcId: 900006, upc: "888849000012", name: "Protein Bar, Cookies and Cream", brand: "Quest", servingLabel: "1 bar (60 g)", servingGrams: 60, kcal: 190, proteinG: 21, carbsG: 22, fatG: 8 },
    { source: "fdc_branded", fdcId: 900007, upc: "811620020157", name: "Ultra-Filtered Milk, 2%", brand: "Fairlife", servingLabel: "1 cup (240 ml)", servingGrams: 240, kcal: 120, proteinG: 13, carbsG: 6, fatG: 4.5 },
    { source: "fdc_branded", fdcId: 900008, upc: "643843714392", name: "Protein Shake, Chocolate", brand: "Premier Protein", servingLabel: "1 carton (325 ml)", servingGrams: 325, kcal: 160, proteinG: 30, carbsG: 4, fatG: 3 },
    { source: "fdc_branded", fdcId: 900009, upc: "051500255162", name: "Creamy Peanut Butter", brand: "Jif", servingLabel: "2 tbsp (32 g)", servingGrams: 32, kcal: 190, proteinG: 7, carbsG: 8, fatG: 16 },
    { source: "fdc_branded", fdcId: 900010, upc: "036632071187", name: "Triple Zero Greek Yogurt, Vanilla", brand: "Oikos", servingLabel: "1 container (150 g)", servingGrams: 150, kcal: 100, proteinG: 15, carbsG: 7, fatG: 0 },
  ]);
  log("Inserted test foods");
}
