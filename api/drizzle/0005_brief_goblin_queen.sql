CREATE TABLE "call_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"assistant_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_sec" integer NOT NULL,
	"end_reason" text NOT NULL,
	"transcript" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "call_logs_started_idx" ON "call_logs" USING btree ("started_at");