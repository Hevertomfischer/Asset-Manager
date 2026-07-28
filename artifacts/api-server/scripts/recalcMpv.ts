import { applyMpvToDatabase } from "../src/services/mpvService.js";

const updated = await applyMpvToDatabase(true);
console.log(`MPV recalculated for ${updated} players`);

// Spot-check Arias
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
const r = await db.execute<{ nickname: string; minimo_para_valorizar: number }>(
  sql`SELECT nickname, minimo_para_valorizar FROM players WHERE external_id = '99815'`
);
console.log("Arias MPV:", r.rows[0]);

process.exit(0);
