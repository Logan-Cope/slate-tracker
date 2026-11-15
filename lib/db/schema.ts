/**
 * Slate database schema.
 *
 * Every user-data table carries `profile_id`. A new person is a profile row,
 * never a migration.
 *
 * Food nutrients are stored PER LABEL SERVING (`serving_label` + `serving_grams`),
 * not per 100 g. Conversions live in lib/nutrition/servings.ts.
 *
 * Weights are stored in lb.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// tsvector isn't built into drizzle's pg-core; declare it so the generated
// column shows up in migrations and selects.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["coach", "client"]);
export const weightUnit = pgEnum("weight_unit", ["lb", "kg"]);
export const foodSource = pgEnum("food_source", [
  "fdc_branded",
  "fdc_foundation",
  "fdc_sr",
  "off",
  "custom",
  "restaurant",
]);
export const restaurantSource = pgEnum("restaurant_source", ["menustat", "web"]);
export const mealSlot = pgEnum("meal_slot", ["breakfast", "lunch", "dinner", "snacks"]);
export const exerciseKind = pgEnum("exercise_kind", [
  "weight_reps",
  "bodyweight_reps",
  "duration",
  "distance",
]);
export const setType = pgEnum("set_type", ["warmup", "normal", "failure", "drop"]);
export const metricKind = pgEnum("metric_kind", ["weight", "waist", "hips", "body_fat", "steps", "sleep_h"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const profiles = pgTable("profiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  weightUnit: weightUnit("weight_unit").notNull().default("lb"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Login key for the passphrase provider; lowercase, no spaces. */
    handle: text("handle").notNull(),
    email: text("email"),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("client"),
    defaultProfileId: integer("default_profile_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_handle_idx").on(t.handle), uniqueIndex("users_email_idx").on(t.email)],
);

export const targets = pgTable(
  "targets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    kcal: integer("kcal").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbsG: integer("carbs_g"),
    fatG: integer("fat_g"),
    /** Calendar date the target applies from. Latest row on or before a date wins. */
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("targets_profile_from_idx").on(t.profileId, t.effectiveFrom)],
);

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

/** A restaurant chain whose menu items live in `foods` with `source = 'restaurant'`. */
export const restaurants = pgTable("restaurants", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Display name, also denormalised into `foods.brand` for its items. */
  name: text("name").notNull(),
  /** Normalised unique key from restaurantSlug(), e.g. "chickfila". */
  slug: text("slug").notNull().unique(),
  source: restaurantSource("source").notNull(),
  sourceUrl: text("source_url"),
  /** 2018-01-01 for MenuStat; the import date for web imports. */
  menuAsOf: date("menu_as_of", { mode: "string" }).notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  itemCount: integer("item_count").notNull().default(0),
});

export const foods = pgTable(
  "foods",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    source: foodSource("source").notNull(),
    fdcId: integer("fdc_id"),
    /** Normalised GTIN/UPC digits with leading zeros stripped. */
    upc: text("upc"),
    name: text("name").notNull(),
    brand: text("brand"),
    /** Label serving, e.g. "1 scoop (31 g)", "1 cup", "100 g". */
    servingLabel: text("serving_label").notNull(),
    /** Grams in one label serving. Null when unknown (servings-only food). */
    servingGrams: real("serving_grams"),
    // Nutrients per ONE label serving.
    kcal: real("kcal").notNull(),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    fiberG: real("fiber_g"),
    /** Set for custom foods; null for shared database foods. */
    profileId: integer("profile_id").references(() => profiles.id),
    /** Saved meals are foods too (source custom, isMeal true) so they log as one line. */
    isMeal: boolean("is_meal").notNull().default(false),
    /** Rough popularity hint used as a tie-breaker in search (branded foods only). */
    popularity: real("popularity").notNull().default(0),
    /** Set for restaurant menu items (source restaurant); null otherwise. */
    restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "restrict" }),
    /** Restaurant items no longer on the menu stay for history but leave search. */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(brand, '')), 'B')`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("foods_search_idx").using("gin", t.search),
    index("foods_upc_idx").on(t.upc),
    index("foods_fdc_idx").on(t.fdcId),
    index("foods_profile_idx").on(t.profileId),
    // Upsert key for restaurant imports: one item name per restaurant.
    uniqueIndex("foods_restaurant_name_uniq")
      .on(t.restaurantId, sql`lower(${t.name})`)
      .where(sql`${t.restaurantId} is not null`),
    // Trigram index for typo tolerance; created in a hand-written migration
    // because drizzle-kit does not emit gin_trgm_ops.
  ],
);

export const foodServings = pgTable(
  "food_servings",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    grams: real("grams").notNull(),
  },
  (t) => [index("food_servings_food_idx").on(t.foodId)],
);

export const savedMealItems = pgTable(
  "saved_meal_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** The meal food row (foods.isMeal = true). */
    mealFoodId: integer("meal_food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id),
    qty: real("qty").notNull(),
    unit: text("unit").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [index("saved_meal_items_meal_idx").on(t.mealFoodId)],
);

export const foodLog = pgTable(
  "food_log",
  {
    /** Client-generated so offline retries are idempotent. */
    id: uuid("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    /** Local calendar date, YYYY-MM-DD. */
    date: date("date", { mode: "string" }).notNull(),
    meal: mealSlot("meal").notNull(),
    foodId: integer("food_id").references(() => foods.id),
    /** Snapshot so history survives food edits/deletes. */
    name: text("name").notNull(),
    brand: text("brand"),
    qty: real("qty").notNull(),
    /** "serving" | "g" | "oz" | an alternate portion label. */
    unit: text("unit").notNull(),
    grams: real("grams"),
    kcal: real("kcal").notNull(),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("food_log_profile_date_idx").on(t.profileId, t.date)],
);

/** Drafts from the restaurant Add flow; review reads one, confirm applies it. */
export const restaurantImports = pgTable("restaurant_imports", {
  /** Client-generated so retries are idempotent. */
  id: text("id").primaryKey(),
  restaurantName: text("restaurant_name").notNull(),
  sourceUrl: text("source_url"),
  items: jsonb("items").notNull(),
  warnings: jsonb("warnings").notNull().default(sql`'[]'::jsonb`),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export const profileFoodStats = pgTable(
  "profile_food_stats",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    timesLogged: integer("times_logged").notNull().default(0),
    lastLoggedAt: timestamp("last_logged_at", { withTimezone: true }).notNull().defaultNow(),
    lastQty: real("last_qty").notNull(),
    lastUnit: text("last_unit").notNull(),
    lastMeal: mealSlot("last_meal"),
    /** 24 buckets: how many times logged in each local hour. */
    hourHist: integer("hour_hist").array().notNull().default(sql`array_fill(0, ARRAY[24])`),
  },
  (t) => [uniqueIndex("profile_food_stats_pk").on(t.profileId, t.foodId)],
);

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export const exercises = pgTable(
  "exercises",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    kind: exerciseKind("kind").notNull().default("weight_reps"),
    primaryMuscle: text("primary_muscle"),
    equipment: text("equipment"),
    isCustom: boolean("is_custom").notNull().default(false),
    profileId: integer("profile_id").references(() => profiles.id),
  },
  (t) => [index("exercises_name_idx").on(t.name)],
);

export const programs = pgTable(
  "programs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    name: text("name").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("programs_profile_idx").on(t.profileId)],
);

export const routines = pgTable(
  "routines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [index("routines_program_idx").on(t.programId)],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    routineId: integer("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: smallint("position").notNull().default(0),
    supersetGroup: smallint("superset_group"),
    targetSets: smallint("target_sets").notNull().default(2),
    /** Human rep scheme, e.g. "Set 1: 10-14 · Set 2: to failure". */
    repScheme: text("rep_scheme"),
    tempo: text("tempo"),
    restSeconds: smallint("rest_seconds").notNull().default(60),
    coachNote: text("coach_note"),
    /** Ghost value before any history exists. */
    startWeightLb: real("start_weight_lb"),
  },
  (t) => [index("routine_exercises_routine_idx").on(t.routineId)],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    routineId: integer("routine_id").references(() => routines.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workouts_profile_started_idx").on(t.profileId, t.startedAt)],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: uuid("id").primaryKey(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: smallint("position").notNull().default(0),
    supersetGroup: smallint("superset_group"),
    notes: text("notes"),
  },
  (t) => [index("workout_exercises_workout_idx").on(t.workoutId)],
);

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey(),
    workoutExerciseId: uuid("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    position: smallint("position").notNull().default(0),
    setType: setType("set_type").notNull().default("normal"),
    weightLb: real("weight_lb"),
    reps: smallint("reps"),
    rpe: real("rpe"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    isPr: boolean("is_pr").notNull().default(false),
  },
  (t) => [index("sets_we_idx").on(t.workoutExerciseId)],
);

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    metric: metricKind("metric").notNull().default("weight"),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    /** Local calendar date the reading belongs to. */
    date: date("date", { mode: "string" }).notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [index("measurements_profile_metric_date_idx").on(t.profileId, t.metric, t.date)],
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Profile = typeof profiles.$inferSelect;
export type User = typeof users.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
export type RestaurantImport = typeof restaurantImports.$inferSelect;
export type NewRestaurantImport = typeof restaurantImports.$inferInsert;
export type FoodServing = typeof foodServings.$inferSelect;
export type FoodLogEntry = typeof foodLog.$inferSelect;
export type NewFoodLogEntry = typeof foodLog.$inferInsert;
export type ProfileFoodStat = typeof profileFoodStats.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type WorkoutSet = typeof sets.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type MealSlot = (typeof mealSlot.enumValues)[number];
export type SetType = (typeof setType.enumValues)[number];
export type RestaurantSource = (typeof restaurantSource.enumValues)[number];
