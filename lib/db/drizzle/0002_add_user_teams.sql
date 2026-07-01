CREATE TABLE IF NOT EXISTS "user_teams" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_team_rounds" (
  "id" serial PRIMARY KEY,
  "user_team_id" integer NOT NULL REFERENCES "user_teams"("id"),
  "round" integer NOT NULL,
  "budget_used" real,
  "captain_player_id" integer REFERENCES "players"("id"),
  "coach_player_id" integer REFERENCES "players"("id"),
  "source" text NOT NULL,
  "lineup_suggestion_id" integer REFERENCES "lineup_suggestion"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_team_round_players" (
  "id" serial PRIMARY KEY,
  "user_team_round_id" integer NOT NULL REFERENCES "user_team_rounds"("id"),
  "player_id" integer NOT NULL REFERENCES "players"("id"),
  "position" text,
  "price" real
);
