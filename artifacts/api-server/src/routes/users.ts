import { Router } from "express";
import { db } from "@workspace/db";
import { userPreferencesTable } from "@workspace/db/schema";
import { createLogger } from "../lib/logger";

const router = Router();
const log = createLogger("users");

const VALID_STRATEGIES = ["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"];

router.patch("/users/me/preferences", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const userId = req.user.id;
  const { defaultStrategy, onboardingCompleted } = req.body as {
    defaultStrategy?: string;
    onboardingCompleted?: boolean;
  };

  if (defaultStrategy !== undefined && !VALID_STRATEGIES.includes(defaultStrategy)) {
    res.status(400).json({ error: "Estratégia inválida" });
    return;
  }

  const updateData: Partial<typeof userPreferencesTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (defaultStrategy !== undefined) updateData.defaultStrategy = defaultStrategy;
  if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;

  await db
    .insert(userPreferencesTable)
    .values({ userId, ...updateData })
    .onConflictDoUpdate({ target: userPreferencesTable.userId, set: updateData });

  log.info("Preferências atualizadas", { userId, defaultStrategy, onboardingCompleted });
  res.json({ ok: true });
});

export default router;
