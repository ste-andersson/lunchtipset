CREATE TABLE "lunch_plans" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lunch_plans_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "lunch_plans" ADD CONSTRAINT "lunch_plans_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lunch_plans_date_idx" ON "lunch_plans" USING btree ("date");