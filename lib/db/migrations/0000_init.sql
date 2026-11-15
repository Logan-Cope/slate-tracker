CREATE TYPE "public"."exercise_kind" AS ENUM('weight_reps', 'bodyweight_reps', 'duration', 'distance');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('fdc_branded', 'fdc_foundation', 'fdc_sr', 'off', 'custom');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snacks');--> statement-breakpoint
CREATE TYPE "public"."metric_kind" AS ENUM('weight', 'waist', 'hips', 'body_fat', 'steps', 'sleep_h');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('warmup', 'normal', 'failure', 'drop');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('coach', 'client');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('lb', 'kg');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exercises_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"kind" "exercise_kind" DEFAULT 'weight_reps' NOT NULL,
	"primary_muscle" text,
	"equipment" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"profile_id" integer
);
--> statement-breakpoint
CREATE TABLE "food_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"date" date NOT NULL,
	"meal" "meal_slot" NOT NULL,
	"food_id" integer,
	"name" text NOT NULL,
	"brand" text,
	"qty" real NOT NULL,
	"unit" text NOT NULL,
	"grams" real,
	"kcal" real NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real,
	"fat_g" real,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_servings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "food_servings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"food_id" integer NOT NULL,
	"label" text NOT NULL,
	"grams" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "foods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" "food_source" NOT NULL,
	"fdc_id" integer,
	"upc" text,
	"name" text NOT NULL,
	"brand" text,
	"serving_label" text NOT NULL,
	"serving_grams" real,
	"kcal" real NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real,
	"fat_g" real,
	"fiber_g" real,
	"profile_id" integer,
	"is_meal" boolean DEFAULT false NOT NULL,
	"popularity" real DEFAULT 0 NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(brand, '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"metric" "metric_kind" DEFAULT 'weight' NOT NULL,
	"value" real NOT NULL,
	"unit" text NOT NULL,
	"date" date NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "profile_food_stats" (
	"profile_id" integer NOT NULL,
	"food_id" integer NOT NULL,
	"times_logged" integer DEFAULT 0 NOT NULL,
	"last_logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_qty" real NOT NULL,
	"last_unit" text NOT NULL,
	"last_meal" "meal_slot",
	"hour_hist" integer[] DEFAULT array_fill(0, ARRAY[24]) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"weight_unit" "weight_unit" DEFAULT 'lb' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routine_exercises_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"routine_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"superset_group" smallint,
	"target_sets" smallint DEFAULT 2 NOT NULL,
	"rep_scheme" text,
	"tempo" text,
	"rest_seconds" smallint DEFAULT 60 NOT NULL,
	"coach_note" text,
	"start_weight_lb" real
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"program_id" integer NOT NULL,
	"name" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_meal_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_meal_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"meal_food_id" integer NOT NULL,
	"food_id" integer NOT NULL,
	"qty" real NOT NULL,
	"unit" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"set_type" "set_type" DEFAULT 'normal' NOT NULL,
	"weight_lb" real,
	"reps" smallint,
	"rpe" real,
	"completed_at" timestamp with time zone,
	"is_pr" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "targets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"carbs_g" integer,
	"fat_g" integer,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"handle" text NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"default_profile_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workout_id" uuid NOT NULL,
	"exercise_id" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"superset_group" smallint,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"routine_id" integer,
	"title" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_servings" ADD CONSTRAINT "food_servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_food_stats" ADD CONSTRAINT "profile_food_stats_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_food_stats" ADD CONSTRAINT "profile_food_stats_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_meal_food_id_foods_id_fk" FOREIGN KEY ("meal_food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_workout_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_profile_id_profiles_id_fk" FOREIGN KEY ("default_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_name_idx" ON "exercises" USING btree ("name");--> statement-breakpoint
CREATE INDEX "food_log_profile_date_idx" ON "food_log" USING btree ("profile_id","date");--> statement-breakpoint
CREATE INDEX "food_servings_food_idx" ON "food_servings" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "foods_search_idx" ON "foods" USING gin ("search");--> statement-breakpoint
CREATE INDEX "foods_upc_idx" ON "foods" USING btree ("upc");--> statement-breakpoint
CREATE INDEX "foods_fdc_idx" ON "foods" USING btree ("fdc_id");--> statement-breakpoint
CREATE INDEX "foods_profile_idx" ON "foods" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "measurements_profile_metric_date_idx" ON "measurements" USING btree ("profile_id","metric","date");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_food_stats_pk" ON "profile_food_stats" USING btree ("profile_id","food_id");--> statement-breakpoint
CREATE INDEX "programs_profile_idx" ON "programs" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "routine_exercises_routine_idx" ON "routine_exercises" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "routines_program_idx" ON "routines" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "saved_meal_items_meal_idx" ON "saved_meal_items" USING btree ("meal_food_id");--> statement-breakpoint
CREATE INDEX "sets_we_idx" ON "sets" USING btree ("workout_exercise_id");--> statement-breakpoint
CREATE INDEX "targets_profile_from_idx" ON "targets" USING btree ("profile_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "workout_exercises_workout_idx" ON "workout_exercises" USING btree ("workout_id");--> statement-breakpoint
CREATE INDEX "workouts_profile_started_idx" ON "workouts" USING btree ("profile_id","started_at");