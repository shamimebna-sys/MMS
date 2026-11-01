import "dotenv/config";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "bootstrap.admin@mms.local").toLowerCase();
  const role = await prisma.role.findUnique({ where: { name: "sadmin" } });
  if (!role) {
    console.error("The sadmin role is missing. Run the legacy migration before creating the admin.");
    process.exit(1);
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
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "bootstrap failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
