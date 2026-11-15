CREATE TYPE "public"."restaurant_source" AS ENUM('menustat', 'web');--> statement-breakpoint
ALTER TYPE "public"."food_source" ADD VALUE 'restaurant';--> statement-breakpoint
CREATE TABLE "restaurant_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_name" text NOT NULL,
	"source_url" text,
	"items" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "restaurants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"source" "restaurant_source" NOT NULL,
	"source_url" text,
	"menu_as_of" date NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "restaurant_id" integer;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurant_imports" ADD CONSTRAINT "restaurant_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "foods_restaurant_name_uniq" ON "foods" USING btree ("restaurant_id",lower("name")) WHERE "foods"."restaurant_id" is not null;