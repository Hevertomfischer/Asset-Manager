import { fetchPopularityMap } from "../providers/gatoMestreProvider";
import { db } from "@workspace/db";

async function main() {
  console.log("=== Testing Gato Mestre popularity fetch ===");
  console.log("GLOBO_GLBID set:", !!process.env.GLOBO_GLBID);
  console.log("");

  const map = await fetchPopularityMap(19);
  console.log(`fetchPopularityMap → ${map.size} entries`);

  if (map.size > 0) {
    console.log("\nTop 10 por popularidade:");
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [id, count] of sorted) {
      console.log(`  atleta_id=${id}: ${count.toLocaleString("pt-BR")} escalações`);
    }
  }

  console.log("\n=== Logs recentes (gato_mestre) ===");
  const logs = await db.query.dataCollectionLogTable
    .findMany({
      where: (t, { eq }) => eq(t.source, "gato_mestre"),
      orderBy: (t, { desc }) => [desc(t.collectedAt)],
      limit: 8,
    })
    .catch(() => []);

  for (const l of logs) {
    console.log(`[${l.status.padEnd(8)}] ${l.message.slice(0, 120)}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
