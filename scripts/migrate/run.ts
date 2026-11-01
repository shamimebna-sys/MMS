import "dotenv/config";
import { migrateLegacy } from "../../src/server/migration/engine";

const stageFlag = process.argv.indexOf("--stage");
const stage = stageFlag >= 0 && process.argv[stageFlag + 1] === "reference" ? "reference" : "full";

migrateLegacy({ stage })
  .then((result) => {
    console.log(`Migration finished: ${result.runId}`);
    console.log(`Report: ${result.reportPath}`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
