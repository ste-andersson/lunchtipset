ALTER TABLE "restaurants" ADD COLUMN "fixed_menu_text" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "fixed_menu" jsonb DEFAULT '[]'::jsonb NOT NULL;