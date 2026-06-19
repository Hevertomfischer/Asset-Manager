import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("passport");

let _googleConfigured = false;

/** Returns true only if Google OAuth was successfully configured at startup. */
export function isGoogleOAuthConfigured(): boolean {
  return _googleConfigured;
}

/**
 * Configures Passport strategies and session serialization.
 *
 * - SESSION_SECRET must be set before calling this (enforced in app.ts).
 * - Google OAuth is optional at startup: if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET /
 *   OAUTH_CALLBACK_URL are absent the strategy is not registered and auth routes
 *   will respond with 503, avoiding silent placeholder credentials.
 */
export function configurePassport(): void {
  const clientID = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];

  if (!clientID || !clientSecret) {
    log.error(
      "Google OAuth não configurado — GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ausentes. " +
      "As rotas /api/auth/google retornarão 503 até que as variáveis sejam definidas e o servidor reiniciado."
    );
  } else {
    passport.use(
      new GoogleStrategy(
        {
          clientID,
          clientSecret,
          callbackURL: "/api/auth/google/callback",
          scope: ["email", "profile"],
          state: false,
          proxy: true,
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

    _googleConfigured = true;
    log.info("Google OAuth configurado (callbackURL dinâmico por request)");
  }

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
