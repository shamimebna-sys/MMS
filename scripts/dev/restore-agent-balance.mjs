import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline";
import pg from "pg";

const staging = "data/migration/mig_20261028T194313_full/staging";
const columns = JSON.parse(fs.readFileSync(`${staging}/agents.columns.json`, "utf8"));
const idIndex = columns.indexOf("id");
const balanceIndex = columns.indexOf("balance");
const updates = [];
const rl = readline.createInterface({ input: fs.createReadStream(`${staging}/agents.ndjson`) });
for await (const line of rl) {
  if (!line) continue;
  const row = JSON.parse(line);
  const balance = row[balanceIndex];
  if (!balance || !balance.includes(".")) continue;
  const digits = balance.split(".")[1].replace(/0+$/, "").length;
  if (digits > 4) updates.push({ id: Number(row[idIndex]), balance });
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const update of updates) {
    await client.query(`UPDATE agents SET balance = $1::numeric WHERE id = $2`, [update.balance, update.id]);
  }
  const result = await client.query(`SELECT COALESCE(SUM(balance), 0)::text AS total FROM agents`);
  console.log(JSON.stringify({ restored: updates.length, targetScale: (result.rows[0].total.split(".")[1] || "").length }));
} finally {
  await client.end();
}
