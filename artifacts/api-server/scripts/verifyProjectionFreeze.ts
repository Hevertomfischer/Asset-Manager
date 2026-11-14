/** Development-only concurrency probe; removes its isolated fixture afterward. */
import assert from "node:assert/strict";
import { db, pool, playerProjectionTable, adminConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { lockRoundProjections, upsertProjection } from "../src/repositories/projectionRepository";
import { createLogger } from "../src/lib/logger";

const log = createLogger("verify-projection-freeze");
async function main() {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") throw new Error("Desenvolvimento apenas.");
  const round = 1000000;
  const key = `projectionLockedRound:${round}`;
  const players = await db.query.playersTable.findMany({ limit: 2 });
  assert.equal(players.length, 2);
  assert.equal(await db.query.playerProjectionTable.findFirst({ where: (t) => eq(t.round, round) }), undefined);
  assert.equal(await db.query.adminConfigTable.findFirst({ where: (t) => eq(t.key, key) }), undefined);
  try {
    await upsertProjection({ playerId: players[0]!.id, round, expectedPoints: 8 });
    await Promise.all([
      lockRoundProjections(round),
      ...Array.from({ length: 8 }, (_, i) => upsertProjection({ playerId: players[0]!.id, round, expectedPoints: i })),
    ]);
    const frozen = await db.query.playerProjectionTable.findFirst({ where: (t) => eq(t.round, round) });
    assert.ok(frozen?.lockedAt);
    await Promise.all(Array.from({ length: 8 }, (_, i) =>
      upsertProjection({ playerId: players[0]!.id, round, expectedPoints: 100 + i, lockedAt: null })));
    assert.deepEqual(await db.query.playerProjectionTable.findFirst({ where: (t) => eq(t.round, round) }), frozen);
    assert.equal(await upsertProjection({ playerId: players[1]!.id, round, expectedPoints: 99 }), null);
    log.info("Concorrência verificada: valores e generated_at imutáveis; inserção tardia bloqueada");
  } finally {
    await db.delete(playerProjectionTable).where(eq(playerProjectionTable.round, round));
    await db.delete(adminConfigTable).where(eq(adminConfigTable.key, key));
  }
}
main().catch((e) => { log.error("Verificação falhou", { error: String(e) }); process.exitCode = 1; })
  .finally(() => pool.end());
