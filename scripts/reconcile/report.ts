import "dotenv/config";
import { Client } from "pg";
import { assertLocalMigrationTarget } from "../../src/server/migration/engine";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  assertLocalMigrationTarget(connectionString);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const runs = await client.query(
      `SELECT id, status, source_sha256, started_at, finished_at FROM migration_runs ORDER BY started_at DESC LIMIT 5`,
    );
    console.log(JSON.stringify(runs.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
