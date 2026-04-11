/**
 * reserveService.ts — Pure business logic for bench reserves and substitutions.
 *
 * Rules implemented:
 *  Normal substitute:  starter did NOT play + reserve scored > 0
 *  Luxury substitute:  ALL starters of that position DID play + luxury reserve scored MORE
 *                      than worst starter of that position (max 1 luxury swap per lineup)
 */

export interface ReservePlayer {
  playerId: number;
  playerName: string;
  playerNickname: string | null;
  position: string;
  clubId: number | null;
  expectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  price: number;
  isLuxuryReserve: boolean;
  orderIndex: number;
}

export interface StarterPlayer {
  playerId: number;
  position: string;
  /** null = no actual data / not in actualMap */
  actualPoints: number | null;
  /** true = player physically took the field this round */
  played: boolean;
}

export interface SubstitutionResult {
  type: "normal" | "luxury";
  position: string;
  outPlayerId: number;
  inPlayerId: number;
  reason: string;
  pointsRemoved: number;
  pointsAdded: number;
}

// ─── Reserve selection ────────────────────────────────────────────────────────

interface RawProjection {
  playerId: number;
  playerName: string;
  playerNickname: string | null;
  position: string;
  clubId: number | null;
  expectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  price: number;
  playProbability: number;
}

/**
 * Given all projections and the already-selected main lineup player IDs,
 * select 1 reserve per position (GOL, ZAG, LAT, MEI, ATA).
 * Picks the highest-expectedPoints candidate per position NOT in the main lineup
 * with playProbability > 0.25.
 *
 * The overall luxury reserve is the reserve with the single highest expectedPoints
 * among all non-coach positions.
 */
export function selectReserves(
  allProjections: RawProjection[],
  mainLineupPlayerIds: Set<number>,
  formationPositions: string[]
): ReservePlayer[] {
  // Distinct positions we need reserves for (no TEC, no duplicates)
  const positions = [...new Set(formationPositions.filter((p) => p !== "TEC"))];

  const candidates = allProjections.filter(
    (p) =>
      !mainLineupPlayerIds.has(p.playerId) &&
      p.playProbability > 0.25 &&
      p.position !== "TEC"
  );

  const reserves: Omit<ReservePlayer, "isLuxuryReserve">[] = [];
  let orderIdx = 0;

  for (const pos of positions) {
    const positionCandidates = candidates
      .filter((p) => p.position === pos)
      .sort((a, b) => b.expectedPoints - a.expectedPoints);

    const best = positionCandidates[0];
    if (!best) continue;

    reserves.push({
      playerId: best.playerId,
      playerName: best.playerName,
      playerNickname: best.playerNickname,
      position: pos,
      clubId: best.clubId,
      expectedPoints: best.expectedPoints,
      floorPoints: best.floorPoints,
      ceilingPoints: best.ceilingPoints,
      price: best.price,
      orderIndex: orderIdx++,
    });
  }

  // Luxury reserve = the single reserve with the highest expected points
  let luxuryIdx = -1;
  let luxuryMax = -Infinity;
  for (let i = 0; i < reserves.length; i++) {
    if (reserves[i]!.expectedPoints > luxuryMax) {
      luxuryMax = reserves[i]!.expectedPoints;
      luxuryIdx = i;
    }
  }

  return reserves.map((r, i) => ({
    ...r,
    isLuxuryReserve: i === luxuryIdx,
  }));
}

// ─── Substitution processing ─────────────────────────────────────────────────

/**
 * Determine whether a player "played" this round.
 * A player is considered to have played if they have actual points >= 0
 * (even negative = they played, just had a bad round).
 * null actual points → data unavailable (treated as "did not play").
 */
function didPlay(actualPoints: number | null): boolean {
  return actualPoints !== null;
}

/**
 * Process substitutions for a round given:
 *  - starters: the main lineup players with their actual points
 *  - reserves: the reserve bench players with their actual points
 *  - actualPoints: map from playerId → actualPoints for this round
 *
 * Returns a list of substitutions to apply, in order (normal first, luxury last).
 * Rules guarantee idempotency: same inputs → same outputs.
 */
export function processSubstitutions(
  starters: StarterPlayer[],
  reserveBench: (ReservePlayer & { actualPoints: number | null })[],
  captainPlayerId: number | null
): SubstitutionResult[] {
  const substitutions: SubstitutionResult[] = [];
  const usedReserveIds = new Set<number>();

  const nonCoachPositions = [...new Set(starters.filter((s) => s.position !== "TEC").map((s) => s.position))];

  // Step 1 — Normal substitutions
  for (const pos of nonCoachPositions) {
    const positionStarters = starters.filter((s) => s.position === pos);
    const reserve = reserveBench.find((r) => r.position === pos && !r.isLuxuryReserve && !usedReserveIds.has(r.playerId));
    if (!reserve) continue;

    // Find starters who did NOT play, sorted deterministically
    const absentStarters = positionStarters
      .filter((s) => !didPlay(s.actualPoints))
      .sort((a, b) => {
        // Rule 8: if tie in absence (we have no round schedule here), use smallest playerId
        return a.playerId - b.playerId;
      });

    if (absentStarters.length === 0) continue;

    // Rule 5: reserve must have scored > 0 to substitute
    const reserveActual = reserve.actualPoints ?? null;
    if (reserveActual === null || reserveActual <= 0) continue;

    const target = absentStarters[0]!;
    const isCaptain = target.playerId === captainPlayerId;
    const removedPoints = isCaptain ? 0 : (target.actualPoints ?? 0);
    const addedPoints = reserveActual;

    substitutions.push({
      type: "normal",
      position: pos,
      outPlayerId: target.playerId,
      inPlayerId: reserve.playerId,
      reason: `Titular não entrou em campo. Reserva pontuou ${addedPoints.toFixed(2)} pts.`,
      pointsRemoved: removedPoints,
      pointsAdded: addedPoints,
    });
    usedReserveIds.add(reserve.playerId);
  }

  // Step 2 — Luxury substitution (at most 1)
  const luxuryReserve = reserveBench.find((r) => r.isLuxuryReserve && !usedReserveIds.has(r.playerId));
  if (!luxuryReserve) return substitutions;

  const luxuryReserveActual = luxuryReserve.actualPoints ?? null;
  if (luxuryReserveActual === null || luxuryReserveActual <= 0) return substitutions;

  const luxuryPos = luxuryReserve.position;
  const positionStarters = starters.filter((s) => s.position === luxuryPos);

  // Luxury only activates when ALL starters of that position played (no absent starters)
  const allPlayed = positionStarters.every((s) => didPlay(s.actualPoints));
  if (!allPlayed) return substitutions;

  // Find the worst starter of that position
  const worstStarter = positionStarters
    .filter((s) => s.actualPoints !== null)
    .sort((a, b) => (a.actualPoints ?? 0) - (b.actualPoints ?? 0))[0];

  if (!worstStarter) return substitutions;

  // Luxury reserve must score MORE than the worst starter
  if (luxuryReserveActual <= (worstStarter.actualPoints ?? 0)) return substitutions;

  substitutions.push({
    type: "luxury",
    position: luxuryPos,
    outPlayerId: worstStarter.playerId,
    inPlayerId: luxuryReserve.playerId,
    reason: `Reserva de Luxo pontuou ${luxuryReserveActual.toFixed(2)} pts, superando o pior titular (${(worstStarter.actualPoints ?? 0).toFixed(2)} pts).`,
    pointsRemoved: worstStarter.actualPoints ?? 0,
    pointsAdded: luxuryReserveActual,
  });

  return substitutions;
}

/**
 * Apply substitutions to a starter list and return the final points total
 * and a record of what changed.
 */
export function applySubstitutions(
  starters: StarterPlayer[],
  substitutions: SubstitutionResult[],
  captainPlayerId: number | null
): {
  finalPoints: number;
  appliedSubstitutions: SubstitutionResult[];
} {
  const pointsMap = new Map<number, number>();
  for (const s of starters) {
    const isCaptain = s.playerId === captainPlayerId;
    const pts = (s.actualPoints ?? 0) * (isCaptain ? 2 : 1);
    pointsMap.set(s.playerId, pts);
  }

  for (const sub of substitutions) {
    // Remove the outgoing player's points and add the incoming player's
    pointsMap.delete(sub.outPlayerId);
    pointsMap.set(sub.inPlayerId, sub.pointsAdded);
  }

  const finalPoints = Array.from(pointsMap.values()).reduce((sum, p) => sum + p, 0);

  return { finalPoints, appliedSubstitutions: substitutions };
}
