import "dotenv/config";
import { migrateLegacy } from "../../src/server/migration/engine";

migrateLegacy({ stage: "reference" })
  .then((result) => {
    console.log(`Reference seed finished: ${result.runId}`);
    console.log(`Report: ${result.reportPath}`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
