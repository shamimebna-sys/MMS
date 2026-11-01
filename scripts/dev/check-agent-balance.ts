import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline";
import pg from "pg";
import { addDecimal, decimalEquals } from "@/lib/money";

const staging = "data/migration/mig_20261028T194313_full/staging";
async function main() {
  const columns = JSON.parse(fs.readFileSync(`${staging}/agents.columns.json`, "utf8")) as string[];
  const balanceIndex = columns.indexOf("balance");
  let source = "0";
  const rl = readline.createInterface({ input: fs.createReadStream(`${staging}/agents.ndjson`) });
  for await (const line of rl) {
    if (!line) continue;
    const row = JSON.parse(line) as Array<string | null>;
    const balance = row[balanceIndex];
    if (balance && /^-?\d+(\.\d+)?$/.test(balance)) source = addDecimal(source, balance);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(`SELECT COALESCE(SUM(balance), 0)::text AS total FROM agents`);
    const target = result.rows[0].total as string;
    console.log(JSON.stringify({ equal: decimalEquals(source, target) }));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "balance check failed");
  process.exit(1);
});
