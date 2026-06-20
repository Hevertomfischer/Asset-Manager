import { Router } from "express";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/sync/status", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "lastFullSyncAt"))
      .limit(1);

    const marketRows = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "marketStatus"))
      .limit(1);

    const lastSyncAt = rows[0]?.value ?? null;
    const marketStatus = marketRows[0]?.value ?? null;

    res.json({
      lastSyncAt,
      marketStatus,
    });
  } catch {
    res.status(500).json({ error: "Falha ao buscar status de sincronização" });
  }
});

export default router;
