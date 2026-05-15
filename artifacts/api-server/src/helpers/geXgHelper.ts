import { db } from "@workspace/db";
import { matchesTable, clubsTable } from "@workspace/db/schema";
import { eq, isNotNull, ne } from "drizzle-orm";

const LEAGUE_AVG_GOALS = 1.35;
const HOME_ADVANTAGE = 1.1;
const MIN_GAMES_FOR_HOME_AWAY_SPLIT = 2;

export interface MatchXg {
  matchId: number;
  homeXg: number;
  awayXg: number;
  homeClubName: string;
  awayClubName: string;
  source: "season_stats" | "estimate";
}

export interface XgSyncResult {
  matchesUpdated: number;
  clubStatsParsed: number;
  clubsMapped: number;
  details: MatchXg[];
  warnings: string[];
}

interface ClubSeasonStat {
  homeGoalsFor: number;
  homeGoalsAgainst: number;
  homeGames: number;
  awayGoalsFor: number;
  awayGoalsAgainst: number;
  awayGames: number;
}

/**
 * Computes expected goals per team for a match using season averages.
 * Formula: xg = attackRating × defenseWeakness × leagueAvg × homeAdvantageMultiplier
 */
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

/**
 * Reads all completed past matches (with recorded scores) and computes
 * per-club season statistics: goals scored and conceded, split by home/away context.
 *
 * Optionally excludes a specific round (used so that the target round's own
 * matches don't influence their own xG calculation).
 */
async function computeClubStatsFromHistory(
  excludeRound?: number
): Promise<Map<number, ClubSeasonStat>> {
  const conditions: Parameters<typeof db.select>[0] extends undefined
    ? never
    : unknown[] = [isNotNull(matchesTable.homeScore), isNotNull(matchesTable.awayScore)];

  const pastMatches = await db
    .select()
    .from(matchesTable)
    .where(
      excludeRound !== undefined
        ? // completed matches excluding the target round
          eq(matchesTable.homeScore, matchesTable.homeScore) // dummy — filter below
        : isNotNull(matchesTable.homeScore)
    );

  // Filter in JS for completed matches (scores present) and optionally exclude round
  const completedMatches = pastMatches.filter(
    (m) =>
      m.homeScore !== null &&
      m.awayScore !== null &&
      (excludeRound === undefined || m.round !== excludeRound)
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

  for (const match of completedMatches) {
    if (match.homeClubId && match.homeScore !== null && match.awayScore !== null) {
      const home = ensure(match.homeClubId);
      home.homeGoalsFor += match.homeScore;
      home.homeGoalsAgainst += match.awayScore;
      home.homeGames++;
    }
    if (match.awayClubId && match.homeScore !== null && match.awayScore !== null) {
      const away = ensure(match.awayClubId);
      away.awayGoalsFor += match.awayScore;
      away.awayGoalsAgainst += match.homeScore;
      away.awayGames++;
    }
  }

  return statsMap;
}

/**
 * Derives attack xG (goals per game) and defensive strength (conceded per game)
 * for a club from its season stats, with a home/away context.
 *
 * Falls back to:
 *  - overall average (home+away combined) when home/away game count is below threshold
 *  - league average when no data is available at all
 */
function deriveClubXg(
  stat: ClubSeasonStat | undefined,
  context: "home" | "away"
): { attack: number; defense: number } {
  if (!stat) {
    return { attack: LEAGUE_AVG_GOALS, defense: LEAGUE_AVG_GOALS };
  }

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
      stat.homeGames >= MIN_GAMES_FOR_HOME_AWAY_SPLIT
        ? stat.homeGoalsFor / stat.homeGames
        : overallAttack;
    const defense =
      stat.homeGames >= MIN_GAMES_FOR_HOME_AWAY_SPLIT
        ? stat.homeGoalsAgainst / stat.homeGames
        : overallDefense;
    return { attack: attack || LEAGUE_AVG_GOALS, defense: defense || LEAGUE_AVG_GOALS };
  } else {
    const attack =
      stat.awayGames >= MIN_GAMES_FOR_HOME_AWAY_SPLIT
        ? stat.awayGoalsFor / stat.awayGames
        : overallAttack;
    const defense =
      stat.awayGames >= MIN_GAMES_FOR_HOME_AWAY_SPLIT
        ? stat.awayGoalsAgainst / stat.awayGames
        : overallDefense;
    return { attack: attack || LEAGUE_AVG_GOALS, defense: defense || LEAGUE_AVG_GOALS };
  }
}

/**
 * Computes per-match xG for the given round using the current season's
 * historical match data from the database.
 *
 * For each match in the round:
 * - homeXg = f(home club's home scoring rate, away club's away defensive record)
 * - awayXg = f(away club's away scoring rate, home club's home defensive record)
 *
 * Falls back to the league average (1.35) for clubs with no match history.
 * No external HTTP requests are made.
 */
export async function syncXgFromSeasonStats(round: number): Promise<XgSyncResult> {
  const warnings: string[] = [];

  // Compute club stats from all completed matches except the target round
  const clubStats = await computeClubStatsFromHistory(round);

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.round, round));

  if (matches.length === 0) {
    warnings.push(
      `No matches found for round ${round}. Ensure matches are synced first.`
    );
    return {
      matchesUpdated: 0,
      clubStatsParsed: clubStats.size,
      clubsMapped: clubStats.size,
      details: [],
      warnings,
    };
  }

  const clubs = await db.select().from(clubsTable);
  const clubMap = new Map(clubs.map((c) => [c.id, c]));

  const details: MatchXg[] = [];
  let matchesUpdated = 0;

  for (const match of matches) {
    const homeStat = match.homeClubId ? clubStats.get(match.homeClubId) : undefined;
    const awayStat = match.awayClubId ? clubStats.get(match.awayClubId) : undefined;

    const { attack: homeAttack, defense: homeDefense } = deriveClubXg(homeStat, "home");
    const { attack: awayAttack, defense: awayDefense } = deriveClubXg(awayStat, "away");

    const hasRealData = !!(
      (homeStat && homeStat.homeGames + homeStat.awayGames > 0) ||
      (awayStat && awayStat.homeGames + awayStat.awayGames > 0)
    );

    // homeXg = how many goals the home team is expected to score
    // (home team's home attack vs away team's away defensive record)
    const homeXg = computeXg(homeAttack, awayDefense, true);
    // awayXg = how many goals the away team is expected to score
    // (away team's away attack vs home team's home defensive record)
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
      source: hasRealData ? "season_stats" : "estimate",
    });

    if (!hasRealData) {
      warnings.push(
        `No season data for ${homeClub?.name ?? match.homeClubId} or ${awayClub?.name ?? match.awayClubId} — using league average.`
      );
    }
  }

  return {
    matchesUpdated,
    clubStatsParsed: clubStats.size,
    clubsMapped: clubStats.size,
    details,
    warnings,
  };
}
