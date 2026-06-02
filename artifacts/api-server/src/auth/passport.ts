import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("passport");

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"];
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"];
const OAUTH_CALLBACK_URL = process.env["OAUTH_CALLBACK_URL"];

export function configurePassport(): void {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_CALLBACK_URL) {
    log.warn("Google OAuth not configured — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or OAUTH_CALLBACK_URL missing. /api/auth/google will not work.");
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID ?? "not-configured",
        clientSecret: GOOGLE_CLIENT_SECRET ?? "not-configured",
        callbackURL: OAUTH_CALLBACK_URL ?? "not-configured",
        scope: ["email", "profile"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            log.warn("Google profile missing email", { profileId: profile.id });
            return done(new Error("Google profile has no email address"));
          }

          const name = profile.displayName ?? null;
          const avatarUrl = profile.photos?.[0]?.value ?? null;
          const externalId = profile.id;

          const [user] = await db
            .insert(usersTable)
            .values({ email, externalId, provider: "google", name, avatarUrl })
            .onConflictDoUpdate({
              target: usersTable.email,
              set: {
                externalId,
                provider: "google",
                name,
                avatarUrl,
                updatedAt: sql`now()`,
              },
            })
            .returning();

          if (!user) {
            return done(new Error("Failed to upsert user"));
          }

          log.info("User authenticated via Google", { userId: user.id, email: user.email });
          return done(null, user);
        } catch (err) {
          log.error("Google OAuth callback error", { error: err instanceof Error ? err.message : String(err) });
          return done(err instanceof Error ? err : new Error(String(err)));
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, id),
      });
      done(null, user ?? null);
    } catch (err) {
      log.error("deserializeUser error", { id, error: err instanceof Error ? err.message : String(err) });
      done(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
