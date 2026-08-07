import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

function loadEnvFile() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] ??= value;
    }
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  loadEnvFile();
  const email = required("SEED_ADMIN_EMAIL").toLowerCase();
  const password = required("SEED_ADMIN_PASSWORD");
  const fullName = process.env.SEED_ADMIN_FULL_NAME?.trim() || "Sornam Platform Admin";
  const phone = process.env.SEED_ADMIN_PHONE?.trim() || null;

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== UserRole.admin) {
        throw new Error(`User ${email} already exists but is not a platform admin`);
      }
      console.log(`Platform admin already exists: ${email}`);
      return;
    }

    const adminCount = await prisma.user.count({ where: { role: UserRole.admin } });
    if (adminCount > 0 && process.env.SEED_ADMIN_ALLOW_ADDITIONAL !== "true") {
      throw new Error("A platform admin already exists. Set SEED_ADMIN_ALLOW_ADDITIONAL=true to create another.");
    }

    const user = await prisma.user.create({
      data: {
        shopId: null,
        fullName,
        phone,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: UserRole.admin,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });
    console.log(`Created platform admin ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
