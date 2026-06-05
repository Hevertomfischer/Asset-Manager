CREATE TABLE "clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"abbreviation" text,
	"badge_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"club_id" integer,
	"name" text NOT NULL,
	"nickname" text,
	"position" text NOT NULL,
	"status" text,
	"price" real,
	"average_points" real,
	"popularity" real,
	"price_variation" real,
	"played_last_round" boolean,
	"games_played" integer,
	"minimo_para_valorizar" real,
	"cumulative_scouts" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"round" integer NOT NULL,
	"home_club_id" integer,
	"away_club_id" integer,
	"match_date" timestamp,
	"stadium" text,
	"status" text,
	"home_score" integer,
	"away_score" integer,
	"home_form" json,
	"away_form" json,
	"home_xg" real,
	"away_xg" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"round" integer NOT NULL,
	"source" text NOT NULL,
	"probable_status" text,
	"play_probability" real,
	"expected_minutes" real,
	"risk_score" real,
	"injury_status" text,
	"suspension_status" text,
	"note" text,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_scout_round" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"round" integer NOT NULL,
	"source" text NOT NULL,
	"points" real,
	"minutes_played" integer,
	"goals" integer,
	"assists" integer,
	"shots" integer,
	"shots_on_target" integer,
	"tackles" integer,
	"interceptions" integer,
	"fouls_suffered" integer,
	"fouls_committed" integer,
	"saves" integer,
	"goals_conceded" integer,
	"clean_sheet" integer,
	"yellow_cards" integer,
	"red_cards" integer,
	"penalty_missed" integer,
	"penalty_saved" integer,
	"own_goals" integer,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_projection" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"round" integer NOT NULL,
	"expected_points" real,
	"floor_points" real,
	"ceiling_points" real,
	"risk_score" real,
	"play_probability" real,
	"expected_minutes" real,
	"matchup_score" real,
	"form_score" real,
	"value_score" real,
	"clean_sheet_probability" real,
	"attack_participation_probability" real,
	"recommendation_score" real,
	"strategy_type" text,
	"explanation_json" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_suggestion_player" (
	"id" serial PRIMARY KEY NOT NULL,
	"lineup_suggestion_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"slot" text,
	"position" text,
	"order_index" integer,
	"projected_points" real,
	"price" real
);
--> statement-breakpoint
CREATE TABLE "lineup_suggestion" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"round" integer NOT NULL,
	"strategy_type" text NOT NULL,
	"formation" text NOT NULL,
	"budget_limit" real,
	"total_cost" real,
	"expected_points" real,
	"risk_score" real,
	"captain_player_id" integer,
	"coach_player_id" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"saved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lineup_reserve" (
	"id" serial PRIMARY KEY NOT NULL,
	"lineup_suggestion_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"position" text NOT NULL,
	"is_luxury_reserve" boolean DEFAULT false NOT NULL,
	"expected_points" real,
	"floor_points" real,
	"ceiling_points" real,
	"price" real,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_substitution" (
	"id" serial PRIMARY KEY NOT NULL,
	"lineup_suggestion_id" integer NOT NULL,
	"round" integer NOT NULL,
	"substitution_type" text NOT NULL,
	"out_player_id" integer NOT NULL,
	"in_player_id" integer NOT NULL,
	"position" text NOT NULL,
	"reason" text,
	"points_removed" real,
	"points_added" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"round" integer NOT NULL,
	"source" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"hash" text
);
--> statement-breakpoint
CREATE TABLE "data_collection_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"entity_type" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"metadata_json" jsonb,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text,
	"provider" text,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"role" text DEFAULT 'user',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"plan" text,
	"status" text,
	"provider" text,
	"external_id" text,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"default_strategy" text DEFAULT 'cost-benefit' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"dedupe_key" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"event" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_club_id_clubs_id_fk" FOREIGN KEY ("home_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_club_id_clubs_id_fk" FOREIGN KEY ("away_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_availability" ADD CONSTRAINT "player_availability_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_scout_round" ADD CONSTRAINT "player_scout_round_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_projection" ADD CONSTRAINT "player_projection_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_suggestion_player" ADD CONSTRAINT "lineup_suggestion_player_lineup_suggestion_id_lineup_suggestion_id_fk" FOREIGN KEY ("lineup_suggestion_id") REFERENCES "public"."lineup_suggestion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_suggestion_player" ADD CONSTRAINT "lineup_suggestion_player_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_suggestion" ADD CONSTRAINT "lineup_suggestion_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_suggestion" ADD CONSTRAINT "lineup_suggestion_captain_player_id_players_id_fk" FOREIGN KEY ("captain_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_suggestion" ADD CONSTRAINT "lineup_suggestion_coach_player_id_players_id_fk" FOREIGN KEY ("coach_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_reserve" ADD CONSTRAINT "lineup_reserve_lineup_suggestion_id_lineup_suggestion_id_fk" FOREIGN KEY ("lineup_suggestion_id") REFERENCES "public"."lineup_suggestion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_reserve" ADD CONSTRAINT "lineup_reserve_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_substitution" ADD CONSTRAINT "lineup_substitution_lineup_suggestion_id_lineup_suggestion_id_fk" FOREIGN KEY ("lineup_suggestion_id") REFERENCES "public"."lineup_suggestion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_substitution" ADD CONSTRAINT "lineup_substitution_out_player_id_players_id_fk" FOREIGN KEY ("out_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_substitution" ADD CONSTRAINT "lineup_substitution_in_player_id_players_id_fk" FOREIGN KEY ("in_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_event_idx" ON "analytics_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");