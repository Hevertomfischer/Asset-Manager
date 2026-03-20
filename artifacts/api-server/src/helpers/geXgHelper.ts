import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const LEAGUE_AVG_GOALS = 1.35;
const HOME_ADVANTAGE = 1.1;

export interface ClubXgStat {
  clubName: string;
  goalsPerGame?: number;
  goalsConcededPerGame?: number;
  sgFavorite?: "high" | "medium";
}

export interface MatchXg {
  matchId: number;
  homeXg: number;
  awayXg: number;
  homeClubName: string;
  awayClubName: string;
  source: "article" | "estimate";
}

export interface XgSyncResult {
  matchesUpdated: number;
  clubStatsParsed: number;
  clubsMapped: number;
  details: MatchXg[];
  warnings: string[];
}

/**
 * Parses the Gato Mestre xG article text for team stats.
 * Extracts goals per game (attack) and goals conceded per game (defense)
 * from mentions in the article narrative.
 */
export function parseClubStatsFromText(text: string): Map<string, ClubXgStat> {
  const stats = new Map<string, ClubXgStat>();

  const numPattern = /(\d+)[,.](\d+)/g;

  const toFloat = (s: string) => parseFloat(s.replace(",", "."));

  const marcadoRe = /([A-Z][a-záàãâéêíóôõúç\w\-]+(?:\s[A-Z][a-záàãâéêíóôõúç\w\-]+)*)[^\n]*?\((\d+[,.]\d+)\s*gol(?:s)?\s*(?:marcado|por jogo)(?:[^\)]*?por jogo)?\)/gi;
  const sofrRe = /([A-Z][a-záàãâéêíóôõúç\w\-]+(?:\s[A-Z][a-záàãâéêíóôõúç\w\-]+)*)[^\n]*?\((\d+[,.]\d+)\s*gol(?:s)?\s*sofrido/gi;

  const lines = text.split(/\n+/);

  for (const line of lines) {
    let m: RegExpExecArray | null;

    const attackLine = /\((\d+[,.]\d+)\s*gol(?:s)?(?:\s+marcado)?\s*por\s*jogo\)/gi;
    while ((m = attackLine.exec(line)) !== null) {
      const val = toFloat(m[1]!);
      const names = extractTeamNamesFromLine(line, m.index);
      for (const name of names) {
        const existing = stats.get(name) ?? { clubName: name };
        stats.set(name, { ...existing, goalsPerGame: val });
      }
    }

    const defLine = /\((\d+[,.]\d+)\s*gol(?:s)?\s*sofrido/gi;
    while ((m = defLine.exec(line)) !== null) {
      const val = toFloat(m[1]!);
      const names = extractTeamNamesFromLine(line, m.index);
      for (const name of names) {
        const existing = stats.get(name) ?? { clubName: name };
        stats.set(name, { ...existing, goalsConcededPerGame: val });
      }
    }
  }

  parseSgFavorites(text, stats);

  return stats;
}

function extractTeamNamesFromLine(line: string, statIndex: number): string[] {
  const context = line.slice(Math.max(0, statIndex - 200), statIndex);

  const teamPattern = /\b(Flamengo|Palmeiras|Fluminense|Chapecoense|Botafogo|Vasco|Corinthians|Atlético|Bahia|Bragantino|RB\s*Bragantino|Cruzeiro|São\s*Paulo|Santos|Grêmio|Internacional|Mirassol|Coritiba|Athletico|Remo|Vitória|Fortaleza)\b/gi;

  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = teamPattern.exec(context)) !== null) {
    names.push(normalize(m[1]!));
  }

  return [...new Set(names)];
}

function parseSgFavorites(text: string, stats: Map<string, ClubXgStat>): void {
  const sgTeams: Array<[string, "high" | "medium"]> = [
    ["Flamengo", "high"],
    ["Palmeiras", "high"],
    ["Fluminense", "high"],
    ["Chapecoense", "medium"],
    ["Coritiba", "medium"],
    ["Mirassol", "medium"],
  ];

  for (const [name, level] of sgTeams) {
    const normName = normalize(name);
    const isMentioned = new RegExp(`\\*{0,2}${name}\\*{0,2}[^.]*?SG|SG[^.]*?${name}`, "i").test(text);
    if (isMentioned) {
      const existing = stats.get(normName) ?? { clubName: normName };
      stats.set(normName, { ...existing, sgFavorite: level });
    }
  }
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Maps a parsed team name to a club ID in the database.
 * Uses substring matching on club name or abbreviation.
 */
export async function mapTeamNamesToClubs(
  teamNames: string[]
): Promise<Map<string, number>> {
  const clubs = await db.select().from(clubsTable);
  const result = new Map<string, number>();

  const aliases: Record<string, string> = {
    "atletico": "atlético",
    "atletico-mg": "atlético",
    "atletico-pr": "athletico",
    "sao paulo": "são paulo",
    "sao-paulo": "são paulo",
    "gremio": "grêmio",
    "rb bragantino": "bragantino",
    "rbbragantino": "bragantino",
    "bragantino": "bragantino",
  };

  for (const teamName of teamNames) {
    const normalized = normalize(teamName);
    const aliased = aliases[normalized] ?? normalized;

    let matched = clubs.find((c) => {
      const cname = normalize(c.name ?? "");
      const cabbr = normalize(c.abbreviation ?? "");
      return cname === aliased || cname.startsWith(aliased) || aliased.startsWith(cname) || cabbr === aliased;
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

/**
 * Computes expected goals per team for a match using season averages.
 * When stats are missing, falls back to the league average.
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
 * Fetches the Gato Mestre xG article from the given URL, parses club stats,
 * maps them to club IDs, computes per-match xG, and stores in the matches table.
 */
export async function syncXgFromArticle(url: string, round: number): Promise<XgSyncResult> {
  const warnings: string[] = [];

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CartolaIntel/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const text: string = typeof response.data === "string"
    ? response.data.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    : JSON.stringify(response.data);

  const clubStats = parseClubStatsFromText(text);
  const teamNames = [...clubStats.keys()];
  const clubIdMap = await mapTeamNamesToClubs(teamNames);

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.round, round));

  if (matches.length === 0) {
    warnings.push(`No matches found for round ${round}. Ensure matches are synced first.`);
    return { matchesUpdated: 0, clubStatsParsed: clubStats.size, clubsMapped: clubIdMap.size, details: [], warnings };
  }

  const clubs = await db.select().from(clubsTable);
  const clubMap = new Map(clubs.map((c) => [c.id, c]));

  const statsByClubId = new Map<number, ClubXgStat>();
  for (const [teamName, clubId] of clubIdMap) {
    const stat = clubStats.get(teamName);
    if (stat) statsByClubId.set(clubId, stat);
  }

  const details: MatchXg[] = [];
  let matchesUpdated = 0;

  for (const match of matches) {
    const homeStat = match.homeClubId ? statsByClubId.get(match.homeClubId) : undefined;
    const awayStat = match.awayClubId ? statsByClubId.get(match.awayClubId) : undefined;

    const homeAttack = homeStat?.goalsPerGame ?? LEAGUE_AVG_GOALS;
    const awayAttack = awayStat?.goalsPerGame ?? LEAGUE_AVG_GOALS;
    const homeDefense = homeStat?.goalsConcededPerGame ?? LEAGUE_AVG_GOALS;
    const awayDefense = awayStat?.goalsConcededPerGame ?? LEAGUE_AVG_GOALS;

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
      source: hasRealData ? "article" : "estimate",
    });

    if (!hasRealData) {
      warnings.push(`No article stats found for ${homeClub?.name ?? match.homeClubId} or ${awayClub?.name ?? match.awayClubId} — using league average.`);
    }
  }

  return {
    matchesUpdated,
    clubStatsParsed: clubStats.size,
    clubsMapped: clubIdMap.size,
    details,
    warnings,
  };
}
