import "dotenv/config";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import { closeDb, prisma } from "@/lib/db";

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "bootstrap.admin@mms.local").toLowerCase();
  const role = await prisma.role.findUnique({ where: { name: "sadmin" } });
  if (!role) {
    throw new Error("The sadmin role is missing. Run the legacy migration before creating the admin.");
  }
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (existing) {
    console.log(`Admin already exists as user ${existing.id}. Password was not changed.`);
    return;
  }
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
  const user = await prisma.user.create({
    data: {
      name: "Admin",
      email,
      password: await hashPassword(password),
      roleId: role.id,
      status: "A",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  const file = path.resolve("data", "bootstrap-admin.local.txt");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `email=${email}\npassword=${password}\nuser_id=${user.id}\n`, { mode: 0o600 });
  console.log(`Created admin user ${user.id}. The password is in data/bootstrap-admin.local.txt.`);
}

main()
  .then(() => 0)
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "bootstrap failed");
    return 1;
  })
  .finally(async () => {
    try {
      await closeDb();
    } catch (error) {
      console.error(error instanceof Error ? error.message : "database shutdown failed");
      process.exitCode = 1;
    }
  })
  .then((code) => {
    const exitCode = code || process.exitCode || 0;
    if (exitCode) process.exit(exitCode);
  });
