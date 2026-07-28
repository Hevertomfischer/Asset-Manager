import { db } from "@workspace/db";
import { matchesTable, clubsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const LEAGUE_AVG_GOALS = 1.35;
const HOME_ADVANTAGE = 1.1;
const MIN_GAMES_FOR_SPLIT = 2;

export interface MatchXg {
  matchId: number;
  homeXg: number;
  awayXg: number;
  homeClubName: string;
  awayClubName: string;
  source: "footystats" | "estimate";
}

export const XG_CLUBS_EXPECTED = 20;
export const XG_CLUBS_DEGRADED_THRESHOLD = 15;

export interface XgSyncResult {
  matchesUpdated: number;
  clubStatsParsed: number;
  clubsMapped: number;
  degraded: boolean;
  details: MatchXg[];
  warnings: string[];
}

// ─── xG formula ──────────────────────────────────────────────────────────────

function computeXg(
  attackPerGame: number,
  opponentConcededPerGame: number,
  isHome: boolean
): number {
  const attackRating = attackPerGame / LEAGUE_AVG_GOALS;
  const defWeakness = opponentConcededPerGame / LEAGUE_AVG_GOALS;
  const advantage = isHome ? HOME_ADVANTAGE : 1.0;
  const xg = LEAGUE_AVG_GOALS * attackRating * defWeakness * advantage;
  return Math.round(Math.min(4.0, Math.max(0.1, xg)) * 100) / 100;
}

// ─── Season-stats fallback ────────────────────────────────────────────────────

interface ClubSeasonStat {
  homeGoalsFor: number;
  homeGoalsAgainst: number;
  homeGames: number;
  awayGoalsFor: number;
  awayGoalsAgainst: number;
  awayGames: number;
}

/**
 * Builds per-club season stats from completed matches in the database,
 * excluding the target round so it doesn't influence its own xG projection.
 */
async function buildClubStatsFromHistory(
  excludeRound: number
): Promise<Map<number, ClubSeasonStat>> {
  const allMatches = await db.select().from(matchesTable);

  const completed = allMatches.filter(
    (m) =>
      m.homeScore !== null &&
      m.awayScore !== null &&
      m.round !== excludeRound
  );

  const statsMap = new Map<number, ClubSeasonStat>();

  const ensure = (id: number): ClubSeasonStat => {
    if (!statsMap.has(id)) {
      statsMap.set(id, {
        homeGoalsFor: 0,
        homeGoalsAgainst: 0,
        homeGames: 0,
        awayGoalsFor: 0,
        awayGoalsAgainst: 0,
        awayGames: 0,
      });
    }
    return statsMap.get(id)!;
  };

  for (const match of completed) {
    if (match.homeClubId !== null && match.homeScore !== null && match.awayScore !== null) {
      const home = ensure(match.homeClubId);
      home.homeGoalsFor += match.homeScore;
      home.homeGoalsAgainst += match.awayScore;
      home.homeGames++;
    }
    if (match.awayClubId !== null && match.homeScore !== null && match.awayScore !== null) {
      const away = ensure(match.awayClubId);
      away.awayGoalsFor += match.awayScore;
      away.awayGoalsAgainst += match.homeScore;
      away.awayGames++;
    }
  }

  return statsMap;
}

function deriveClubRates(
  stat: ClubSeasonStat | undefined,
  context: "home" | "away"
): { attack: number; defense: number } {
  if (!stat) return { attack: LEAGUE_AVG_GOALS, defense: LEAGUE_AVG_GOALS };

  const totalGames = stat.homeGames + stat.awayGames;
  const overallAttack =
    totalGames > 0
      ? (stat.homeGoalsFor + stat.awayGoalsFor) / totalGames
      : LEAGUE_AVG_GOALS;
  const overallDefense =
    totalGames > 0
      ? (stat.homeGoalsAgainst + stat.awayGoalsAgainst) / totalGames
      : LEAGUE_AVG_GOALS;

  if (context === "home") {
    const attack =
      stat.homeGames >= MIN_GAMES_FOR_SPLIT
        ? stat.homeGoalsFor / stat.homeGames
        : overallAttack;
    const defense =
      stat.homeGames >= MIN_GAMES_FOR_SPLIT
        ? stat.homeGoalsAgainst / stat.homeGames
        : overallDefense;
    return { attack: attack || LEAGUE_AVG_GOALS, defense: defense || LEAGUE_AVG_GOALS };
  } else {
    const attack =
      stat.awayGames >= MIN_GAMES_FOR_SPLIT
        ? stat.awayGoalsFor / stat.awayGames
        : overallAttack;
    const defense =
      stat.awayGames >= MIN_GAMES_FOR_SPLIT
        ? stat.awayGoalsAgainst / stat.awayGames
        : overallDefense;
    return { attack: attack || LEAGUE_AVG_GOALS, defense: defense || LEAGUE_AVG_GOALS };
  }
}

// ─── Core sync logic ──────────────────────────────────────────────────────────

interface ClubXgRates {
  xgHome: number;
  xgAway: number;
  concededPerGame: number;
}

async function applyXgToRound(
  round: number,
  ratesByClubId: Map<number, ClubXgRates>,
  warnings: string[]
): Promise<{ matchesUpdated: number; clubsMapped: number; details: MatchXg[] }> {
  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.round, round));

  if (matches.length === 0) {
    warnings.push(`No matches found for round ${round}. Ensure matches are synced first.`);
    return { matchesUpdated: 0, clubsMapped: ratesByClubId.size, details: [] };
  }

  const clubs = await db.select().from(clubsTable);
  const clubMap = new Map(clubs.map((c) => [c.id, c]));

  const details: MatchXg[] = [];
  let matchesUpdated = 0;

  for (const match of matches) {
    const homeRates = match.homeClubId ? ratesByClubId.get(match.homeClubId) : undefined;
    const awayRates = match.awayClubId ? ratesByClubId.get(match.awayClubId) : undefined;

    const homeAttack = homeRates?.xgHome ?? LEAGUE_AVG_GOALS;
    const awayAttack = awayRates?.xgAway ?? LEAGUE_AVG_GOALS;
    const homeDefense = homeRates?.concededPerGame ?? LEAGUE_AVG_GOALS;
    const awayDefense = awayRates?.concededPerGame ?? LEAGUE_AVG_GOALS;

    const hasRealData = !!(homeRates || awayRates);

    const homeXg = computeXg(homeAttack, awayDefense, true);
    const awayXg = computeXg(awayAttack, homeDefense, false);

    await db
      .update(matchesTable)
      .set({ homeXg, awayXg, updatedAt: new Date() })
      .where(eq(matchesTable.id, match.id));

    matchesUpdated++;

    const homeClub = match.homeClubId ? clubMap.get(match.homeClubId) : undefined;
    const awayClub = match.awayClubId ? clubMap.get(match.awayClubId) : undefined;

    details.push({
      matchId: match.id,
      homeXg,
      awayXg,
      homeClubName: homeClub?.abbreviation ?? homeClub?.name ?? "?",
      awayClubName: awayClub?.abbreviation ?? awayClub?.name ?? "?",
      source: hasRealData ? "footystats" : "estimate",
    });

    if (!hasRealData) {
      warnings.push(
        `No data for ${homeClub?.name ?? match.homeClubId} or ${awayClub?.name ?? match.awayClubId} — using league average.`
      );
    }
  }

  return { matchesUpdated, clubsMapped: ratesByClubId.size, details };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes xG estimates for all matches in the given round from the season's
 * historical match scores already stored in the database.
 *
 * Previously this function attempted to scrape footystats.org, but that site
 * consistently blocks automated requests via Cloudflare (403). The historical
 * stats source is actually more accurate for the Brasileirão because it uses
 * real match outcomes from the current season rather than generic external data.
 *
 * The function name is preserved for backward compatibility with the ETL pipeline.
 */
export async function syncXgFromFootystats(round: number): Promise<XgSyncResult> {
  const warnings: string[] = [];

  // Build xG rates from real season match history in the DB.
  const seasonStats = await buildClubStatsFromHistory(round);
  const clubStatsParsed = seasonStats.size;

  const ratesByClubId = new Map<number, ClubXgRates>();
  for (const [clubId, stat] of seasonStats) {
    const { attack: homeAttack, defense: homeDefense } = deriveClubRates(stat, "home");
    const { attack: awayAttack } = deriveClubRates(stat, "away");
    ratesByClubId.set(clubId, {
      xgHome: homeAttack,
      xgAway: awayAttack,
      concededPerGame: homeDefense,
    });
  }

  console.log(`[geXgHelper] Built xG rates from season history for ${clubStatsParsed} clubs (round ${round})`);

  // Apply computed rates to the round's matches.
  const { matchesUpdated, clubsMapped, details } = await applyXgToRound(
    round,
    ratesByClubId,
    warnings
  );

  const degraded = clubsMapped < XG_CLUBS_DEGRADED_THRESHOLD;
  if (degraded) {
    warnings.push(
      `Only ${clubsMapped} of ${XG_CLUBS_EXPECTED} expected clubs matched — insufficient season history yet (early rounds).`
    );
  }

  return {
    matchesUpdated,
    clubStatsParsed,
    clubsMapped,
    degraded,
    details,
    warnings,
  };
}
