import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const LEAGUE_AVG_GOALS = 1.35;
const HOME_ADVANTAGE = 1.1;
const MIN_GAMES_FOR_SPLIT = 2;

const FOOTYSTATS_XG_URL = "https://footystats.org/pt/brazil/serie-a/xg";
const FOOTYSTATS_CONCEDED_URL =
  "https://footystats.org/pt/brazil/serie-a/goals-conceded-table";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "Cache-Control": "max-age=0",
};

// Known club display names on footystats.org for the Serie A page.
const FOOTYSTATS_CLUBS: string[] = [
  "Vasco da Gama",
  "Bahia",
  "Internacional",
  "Santos",
  "Cruzeiro",
  "Fluminense",
  "Flamengo",
  "Botafogo",
  "Palmeiras",
  "São Paulo",
  "Grêmio",
  "Atlético Mineiro",
  "Chapecoense",
  "Corinthians",
  "Coritiba",
  "RB Bragantino",
  "Bragantino",
  "Atlético PR",
  "Remo",
  "Mirassol",
  "Vitória",
  "Fortaleza",
  "Sport",
  "Ceará",
  "América MG",
  "Goiás",
];

export interface MatchXg {
  matchId: number;
  homeXg: number;
  awayXg: number;
  homeClubName: string;
  awayClubName: string;
  source: "footystats" | "estimate";
}

export interface XgSyncResult {
  matchesUpdated: number;
  clubStatsParsed: number;
  clubsMapped: number;
  details: MatchXg[];
  warnings: string[];
}

// ─── Utility ────────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#\d+;/gi, " ")
    .replace(/&[a-z]{2,8};/gi, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// ─── Footystats HTML parsing ─────────────────────────────────────────────────

function splitXgSections(stripped: string): {
  overall: string;
  home: string;
  away: string;
} {
  const geralIdx = stripped.search(/xG\s+Geral/i);
  const casaIdx = stripped.search(/xG\s+Casa/i);
  const foraIdx = stripped.search(/xG\s+Fora/i);

  const overall =
    geralIdx >= 0
      ? stripped.slice(geralIdx, casaIdx > geralIdx ? casaIdx : geralIdx + 5000)
      : stripped.slice(0, 5000);

  const home =
    casaIdx >= 0
      ? stripped.slice(casaIdx, foraIdx > casaIdx ? foraIdx : casaIdx + 5000)
      : "";

  const away = foraIdx >= 0 ? stripped.slice(foraIdx, foraIdx + 5000) : "";

  return { overall, home, away };
}

/**
 * Parses a section of stripped xG page text.
 * Returns lowercase club name → xG value per game.
 */
function parseXgSection(sectionText: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const clubName of FOOTYSTATS_CLUBS) {
    const escaped = escapeRe(clubName);
    const re = new RegExp(`${escaped}[\\s\\S]{0,400}?(\\d+\\.\\d+)\\s*xG`, "i");
    const m = re.exec(sectionText);
    if (m) {
      result.set(normalize(clubName), parseFloat(m[1]!));
    }
  }
  return result;
}

/**
 * Parses the goals-conceded table from footystats.
 * Returns lowercase club name → goals conceded per game.
 */
function parseConcededTable(stripped: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const clubName of FOOTYSTATS_CLUBS) {
    const escaped = escapeRe(clubName);
    const re = new RegExp(
      `${escaped}[\\s\\S]{0,200}?\\b(\\d{1,2})\\b[\\s\\S]{0,100}?\\b(\\d{1,3})\\b`,
      "i"
    );
    const m = re.exec(stripped);
    if (m) {
      const pj = parseInt(m[1]!);
      const totalConceded = parseInt(m[2]!);
      if (pj >= 1 && pj <= 38 && totalConceded >= 0 && totalConceded <= pj * 10) {
        result.set(normalize(clubName), totalConceded / pj);
      }
    }
  }
  return result;
}

// ─── Club-to-DB mapping ───────────────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  "atletico": "atlético",
  "atletico-mg": "atlético",
  "atletico mineiro": "atlético",
  "atlético mineiro": "atlético",
  "atletico-pr": "athletico",
  "atlético pr": "athletico",
  "sao paulo": "são paulo",
  "sao-paulo": "são paulo",
  "gremio": "grêmio",
  "rb bragantino": "bragantino",
  "rbbragantino": "bragantino",
  "bragantino": "bragantino",
  "vasco da gama": "vasco",
  "america mg": "américa",
};

export async function mapTeamNamesToClubs(
  teamNames: string[]
): Promise<Map<string, number>> {
  const clubs = await db.select().from(clubsTable);
  const result = new Map<string, number>();

  for (const teamName of teamNames) {
    const normalized = normalize(teamName);
    const aliased = ALIASES[normalized] ?? normalized;

    let matched = clubs.find((c) => {
      const cname = normalize(c.name ?? "");
      const cabbr = normalize(c.abbreviation ?? "");
      return (
        cname === aliased ||
        cname.startsWith(aliased) ||
        aliased.startsWith(cname) ||
        cabbr === aliased
      );
    });

    if (!matched && aliased.length >= 4) {
      matched = clubs.find((c) => normalize(c.name ?? "").includes(aliased));
    }

    if (matched) {
      result.set(teamName, matched.id);
    }
  }

  return result;
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
 * Fetches xG data from footystats.org for both the offensive xG page
 * (/pt/brazil/serie-a/xg) and the goals-conceded table, maps clubs to DB IDs,
 * computes per-match xG for the given round, and stores in the matches table.
 *
 * If footystats.org is unreachable (e.g. anti-bot challenge), falls back
 * to computing xG from the season's historical match scores already in the DB.
 * A warning is included in the result when fallback is used.
 */
export async function syncXgFromFootystats(round: number): Promise<XgSyncResult> {
  const warnings: string[] = [];

  // ── 1. Try fetching footystats.org pages ──────────────────────────────────
  let footystatsRates: Map<number, ClubXgRates> | null = null;
  let clubStatsParsed = 0;

  try {
    const [xgHtml, concededHtml] = await Promise.all([
      axios.get<string>(FOOTYSTATS_XG_URL, {
        timeout: 20000,
        headers: BROWSER_HEADERS,
        responseType: "text",
      }),
      axios.get<string>(FOOTYSTATS_CONCEDED_URL, {
        timeout: 20000,
        headers: BROWSER_HEADERS,
        responseType: "text",
      }),
    ]);

    const isCloudflareBlock = (text: string) =>
      text.includes("Just a moment") ||
      text.includes("cf-browser-verification") ||
      text.includes("Checking your browser");

    if (
      isCloudflareBlock(xgHtml.data) ||
      isCloudflareBlock(concededHtml.data)
    ) {
      throw new Error("Cloudflare challenge page returned");
    }

    const xgStripped = stripHtml(xgHtml.data);
    const concededStripped = stripHtml(concededHtml.data);

    const { overall: geralText, home: casaText, away: foraText } =
      splitXgSections(xgStripped);

    const xgOverall = parseXgSection(geralText);
    const xgHome = parseXgSection(casaText.length > 50 ? casaText : xgStripped);
    const xgAway = parseXgSection(foraText.length > 50 ? foraText : xgStripped);
    const concededMap = parseConcededTable(concededStripped);

    const parsedNames = FOOTYSTATS_CLUBS.map((n) => normalize(n)).filter(
      (n) =>
        xgOverall.has(n) || xgHome.has(n) || xgAway.has(n) || concededMap.has(n)
    );

    if (parsedNames.length === 0) {
      throw new Error("Footystats pages returned no parseable club data");
    }

    const clubIdMap = await mapTeamNamesToClubs(parsedNames);
    clubStatsParsed = parsedNames.length;

    footystatsRates = new Map<number, ClubXgRates>();
    for (const name of parsedNames) {
      const clubId = clubIdMap.get(name);
      if (!clubId) continue;
      const overall = xgOverall.get(name) ?? LEAGUE_AVG_GOALS;
      footystatsRates.set(clubId, {
        xgHome: xgHome.get(name) ?? overall,
        xgAway: xgAway.get(name) ?? overall,
        concededPerGame: concededMap.get(name) ?? LEAGUE_AVG_GOALS,
      });
    }

    console.log(
      `[geXgHelper] Fetched footystats.org data for ${parsedNames.length} clubs`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(
      `footystats.org unavailable (${msg}); computing xG from season statistics in database.`
    );
    console.warn(`[geXgHelper] footystats fetch failed: ${msg} — using season stats fallback`);
  }

  // ── 2. Fall back to season stats when footystats unavailable ──────────────
  let ratesByClubId: Map<number, ClubXgRates>;

  if (footystatsRates && footystatsRates.size > 0) {
    ratesByClubId = footystatsRates;
  } else {
    const seasonStats = await buildClubStatsFromHistory(round);
    clubStatsParsed = seasonStats.size;

    ratesByClubId = new Map<number, ClubXgRates>();
    for (const [clubId, stat] of seasonStats) {
      const { attack: homeAttack, defense: homeDefense } = deriveClubRates(stat, "home");
      const { attack: awayAttack } = deriveClubRates(stat, "away");
      ratesByClubId.set(clubId, {
        xgHome: homeAttack,
        xgAway: awayAttack,
        concededPerGame: homeDefense,
      });
    }
  }

  // ── 3. Apply rates to the round's matches ─────────────────────────────────
  const { matchesUpdated, clubsMapped, details } = await applyXgToRound(
    round,
    ratesByClubId,
    warnings
  );

  return {
    matchesUpdated,
    clubStatsParsed,
    clubsMapped,
    details,
    warnings,
  };
}
