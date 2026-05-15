import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const LEAGUE_AVG_GOALS = 1.35;
const HOME_ADVANTAGE = 1.1;

const FOOTYSTATS_XG_URL = "https://footystats.org/pt/brazil/serie-a/xg";
const FOOTYSTATS_CONCEDED_URL =
  "https://footystats.org/pt/brazil/serie-a/goals-conceded-table";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

// Known club display names as shown on footystats.org for the Serie A page.
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

async function fetchHtml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: 20000,
    headers: FETCH_HEADERS,
    responseType: "text",
  });
  return response.data;
}

/**
 * Splits the stripped xG page text into sections: overall, home, away.
 */
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
 * Parses a section of stripped xG page text and returns
 * lowercase club name → xG value per game.
 *
 * Footystats format after tag-stripping:
 *   "ClubName\n...\n1.43\nxG" or "ClubName ... 1.43xG"
 */
function parseXgSection(sectionText: string): Map<string, number> {
  const result = new Map<string, number>();

  for (const clubName of FOOTYSTATS_CLUBS) {
    const escaped = escapeRe(clubName);
    const re = new RegExp(
      `${escaped}[\\s\\S]{0,400}?(\\d+\\.\\d+)\\s*xG`,
      "i"
    );
    const m = re.exec(sectionText);
    if (m) {
      result.set(normalize(clubName), parseFloat(m[1]!));
    }
  }

  return result;
}

/**
 * Parses the goals-conceded table page from footystats.
 * Returns lowercase club name → goals conceded per game.
 *
 * After stripping tags, each table row becomes:
 *   "ClubName\nPJ\nGoalsConceded\nHome\nAway\n..."
 */
function parseConcededTable(stripped: string): Map<string, number> {
  const result = new Map<string, number>();

  for (const clubName of FOOTYSTATS_CLUBS) {
    const escaped = escapeRe(clubName);
    // Club name, then within 200 chars: games played (1-38), then total goals conceded
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

/**
 * Maps footystats display names to club IDs in the database.
 */
export async function mapTeamNamesToClubs(
  teamNames: string[]
): Promise<Map<string, number>> {
  const clubs = await db.select().from(clubsTable);
  const result = new Map<string, number>();

  const aliases: Record<string, string> = {
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

  for (const teamName of teamNames) {
    const normalized = normalize(teamName);
    const aliased = aliases[normalized] ?? normalized;

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
      matched = clubs.find((c) =>
        normalize(c.name ?? "").includes(aliased)
      );
    }

    if (matched) {
      result.set(teamName, matched.id);
    }
  }

  return result;
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
 * Fetches footystats.org Serie A xG data, parses offensive xG per club
 * (overall / home / away) and goals conceded per game per club, then
 * computes per-match xG for the given round and stores in the matches table.
 *
 * Home matches use the club's home xG as attack and away xG for the away team.
 * Goals conceded per game from the goals-conceded table is the defensive multiplier.
 */
export async function syncXgFromFootystats(round: number): Promise<XgSyncResult> {
  const warnings: string[] = [];

  const [xgHtml, concededHtml] = await Promise.all([
    fetchHtml(FOOTYSTATS_XG_URL),
    fetchHtml(FOOTYSTATS_CONCEDED_URL),
  ]);

  const xgStripped = stripHtml(xgHtml);
  const concededStripped = stripHtml(concededHtml);

  const { overall: geralText, home: casaText, away: foraText } =
    splitXgSections(xgStripped);

  const xgOverall = parseXgSection(geralText);
  const xgHome = parseXgSection(casaText.length > 50 ? casaText : xgStripped);
  const xgAway = parseXgSection(foraText.length > 50 ? foraText : xgStripped);
  const concededMap = parseConcededTable(concededStripped);

  interface ClubStat {
    xgHome: number;
    xgAway: number;
    concededPerGame: number;
  }

  const parsedNames = FOOTYSTATS_CLUBS.map((n) => normalize(n)).filter(
    (n) => xgOverall.has(n) || xgHome.has(n) || xgAway.has(n) || concededMap.has(n)
  );

  const clubIdMap = await mapTeamNamesToClubs(parsedNames);

  const statsByClubId = new Map<number, ClubStat>();
  for (const name of parsedNames) {
    const clubId = clubIdMap.get(name);
    if (!clubId) continue;
    const overall = xgOverall.get(name) ?? LEAGUE_AVG_GOALS;
    statsByClubId.set(clubId, {
      xgHome: xgHome.get(name) ?? overall,
      xgAway: xgAway.get(name) ?? overall,
      concededPerGame: concededMap.get(name) ?? LEAGUE_AVG_GOALS,
    });
  }

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
      clubStatsParsed: parsedNames.length,
      clubsMapped: clubIdMap.size,
      details: [],
      warnings,
    };
  }

  const clubs = await db.select().from(clubsTable);
  const clubMap = new Map(clubs.map((c) => [c.id, c]));

  const details: MatchXg[] = [];
  let matchesUpdated = 0;

  for (const match of matches) {
    const homeStat = match.homeClubId
      ? statsByClubId.get(match.homeClubId)
      : undefined;
    const awayStat = match.awayClubId
      ? statsByClubId.get(match.awayClubId)
      : undefined;

    const homeAttack = homeStat?.xgHome ?? LEAGUE_AVG_GOALS;
    const awayAttack = awayStat?.xgAway ?? LEAGUE_AVG_GOALS;
    const homeDefense = homeStat?.concededPerGame ?? LEAGUE_AVG_GOALS;
    const awayDefense = awayStat?.concededPerGame ?? LEAGUE_AVG_GOALS;

    const hasRealData = !!(homeStat || awayStat);

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
        `No footystats data for ${homeClub?.name ?? match.homeClubId} or ${awayClub?.name ?? match.awayClubId} — using league average.`
      );
    }
  }

  return {
    matchesUpdated,
    clubStatsParsed: parsedNames.length,
    clubsMapped: clubIdMap.size,
    details,
    warnings,
  };
}
