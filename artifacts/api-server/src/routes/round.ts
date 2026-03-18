import { Router } from "express";
import axios from "axios";
import { db } from "@workspace/db";
import { dataCollectionLogTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";

const router = Router();

router.get("/round/current", async (_req, res) => {
  try {
    const response = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
    const data = response.data as {
      rodada_atual?: number;
      mercado_status?: number;
      fechamento?: { seconds?: number };
      times_escalados?: number;
    };

    res.json({
      round: data.rodada_atual ?? 1,
      marketStatus: data.mercado_status ?? 0,
      marketOpen: data.mercado_status === 1,
      closingTimestamp: data.fechamento?.seconds ?? null,
      closingDate: data.fechamento?.seconds ? new Date(data.fechamento.seconds * 1000).toISOString() : null,
      timesEscalados: data.times_escalados ?? 0,
    });
  } catch {
    res.json({
      round: 1,
      marketStatus: 0,
      marketOpen: false,
      closingTimestamp: null,
      closingDate: null,
      timesEscalados: 0,
      warning: "Could not fetch live market status",
    });
  }
});

export default router;
