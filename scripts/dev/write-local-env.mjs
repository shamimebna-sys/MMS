import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

const passwordPath = path.join(dataDir, "db-password.local.txt");
let password = "";
if (fs.existsSync(passwordPath)) {
  password = fs.readFileSync(passwordPath, "utf8").trim();
}
if (!password) {
  password = randomBytes(24).toString("base64url");
  fs.writeFileSync(passwordPath, `${password}\n`, { mode: 0o600 });
}

const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  console.log(".env already present");
  process.exit(0);
}

const authSecret = randomBytes(32).toString("base64url");
const body = [
  `DATABASE_URL=postgresql://mms:${password}@127.0.0.1:54329/mms_dev`,
  `DATABASE_URL_TEST=postgresql://mms:${password}@127.0.0.1:54329/mms_test`,
  `AUTH_SECRET=${authSecret}`,
  "AUTH_ISSUER=mms",
  "AUTH_AUDIENCE=mms-web",
  "BOOTSTRAP_ADMIN_EMAIL=bootstrap.admin@mms.local",
  "BOOTSTRAP_ADMIN_PASSWORD=",
  "MMS_ALLOW_MIGRATION=local-dev",
  "LEGACY_DUMP_PATH=./docs/db.txt",
  "UPLOAD_DIR=./data/uploads",
  "APP_URL=http://127.0.0.1:3000",
  "SMTP_HOST=",
  "SMTP_PORT=587",
  "SMTP_SECURE=false",
  "SMTP_USER=",
  "SMTP_PASSWORD=",
  "SMTP_FROM=MMS <noreply@mms.local>",
  "PDF_FONT_PATH=./assets/fonts/Roboto-Regular.ttf",
  "",
].join("\n");

fs.writeFileSync(envPath, body, { mode: 0o600 });
console.log("wrote .env and local database password file");
