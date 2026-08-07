/**
 * Seeds Amaan's modules (M3 inventory + stock, M5 karigar, M4 content) with demo
 * data so the workflow is visible out of the box. Idempotent: safe to re-run.
 *
 *   npm run seed:ops:dev     (ts-node)
 *   npm run seed:ops         (compiled)
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  ContentAssetType,
  ContentRequestStatus,
  InventoryStatus,
  KarigarJobStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";

function loadEnvFile() {
  const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

const STOCK = [
  { name: "Solitaire band", category: "ring", purity: "22K", weight: "4.500", value: "42000", ageDays: 12 },
  { name: "Antique temple ring", category: "ring", purity: "22K", weight: "6.200", value: "58000", ageDays: 240 },
  { name: "Lakshmi haaram", category: "necklace", purity: "22K", weight: "48.300", value: "445000", ageDays: 320 },
  { name: "Daily chain 18in", category: "necklace", purity: "22K", weight: "12.100", value: "112000", ageDays: 20 },
  { name: "Broad kada pair", category: "bangle", purity: "22K", weight: "36.000", value: "330000", ageDays: 400 },
  { name: "Thin bangle set", category: "bangle", purity: "18K", weight: "18.400", value: "150000", ageDays: 45 },
  { name: "Jhumka classic", category: "earring", purity: "22K", weight: "8.700", value: "82000", ageDays: 190 },
  { name: "Rope chain 20in", category: "chain", purity: "22K", weight: "15.600", value: "146000", ageDays: 275 },
  { name: "Ganesh pendant", category: "pendant", purity: "24K", weight: "3.200", value: "34000", ageDays: 210 },
  { name: "10g gold coin", category: "coin", purity: "24K", weight: "10.000", value: "78000", ageDays: 500 },
];

async function main() {
  loadEnvFile();
  const shopName = process.env.SEED_SHOP_NAME?.trim() || "Sornam Demo Jewellers";
  const ownerEmail = (process.env.SEED_OWNER_EMAIL?.trim() || "owner@demo.sornam").toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD?.trim() || "DemoOwnerPass123";

  const prisma = new PrismaClient();
  try {
    const shop =
      (await prisma.shop.findFirst({ where: { name: shopName } })) ??
      (await prisma.shop.create({ data: { name: shopName } }));

    const owner =
      (await prisma.user.findUnique({ where: { email: ownerEmail } })) ??
      (await prisma.user.create({
        data: {
          shopId: shop.id,
          fullName: "Demo Owner",
          email: ownerEmail,
          passwordHash: await bcrypt.hash(ownerPassword, 12),
          role: UserRole.owner,
        },
      }));

    // --- M3 inventory ---
    const existingItems = await prisma.inventoryItem.count({ where: { shopId: shop.id } });
    if (existingItems === 0) {
      for (const s of STOCK) {
        await prisma.inventoryItem.create({
          data: {
            shopId: shop.id,
            name: s.name,
            category: s.category,
            purity: s.purity,
            grossWeight: s.weight,
            netWeight: s.weight,
            estimatedValue: s.value,
            acquisitionDate: daysAgo(s.ageDays),
            status: InventoryStatus.available,
            photoUrl: `https://picsum.photos/seed/${encodeURIComponent(s.name)}/800/800`,
          },
        });
      }
    }

    // --- M5 karigar + open job ---
    let karigar = await prisma.karigar.findFirst({ where: { shopId: shop.id } });
    if (!karigar) {
      karigar = await prisma.karigar.create({
        data: { shopId: shop.id, name: "Murugan Aasari", specialization: "chains" },
      });
      await prisma.karigarJob.create({
        data: {
          shopId: shop.id,
          karigarId: karigar.id,
          itemDescription: "Rope chain order",
          purity: "22K",
          issuedWeight: "50.000",
          status: KarigarJobStatus.open,
          createdBy: owner.id,
        },
      });
    }

    // --- M4 content gallery item ---
    const existingRequests = await prisma.contentRequest.count({ where: { shopId: shop.id } });
    if (existingRequests === 0) {
      const request = await prisma.contentRequest.create({
        data: {
          shopId: shop.id,
          requestedBy: owner.id,
          occasion: "festival",
          prompt: "Festival still for temple necklace",
          status: ContentRequestStatus.ready,
        },
      });
      await prisma.contentAsset.create({
        data: {
          shopId: shop.id,
          contentRequestId: request.id,
          assetType: ContentAssetType.still,
          url: "https://picsum.photos/seed/sornam-content/1080/1350",
          caption: "Timeless temple gold for festival. Crafted to be treasured. #jewellery #gold",
          aiLabel: "Heritage Opulence - Festival",
          metadata: { provider: "seed", houseLook: "heritage-opulence", disclosure: { text: "AI-generated" } },
        },
      });
    }

    const counts = {
      shop: shop.name,
      owner: owner.email,
      inventoryItems: await prisma.inventoryItem.count({ where: { shopId: shop.id } }),
      karigars: await prisma.karigar.count({ where: { shopId: shop.id } }),
      karigarJobs: await prisma.karigarJob.count({ where: { shopId: shop.id } }),
      contentAssets: await prisma.contentAsset.count({ where: { shopId: shop.id } }),
    };
    console.log("Ops seed complete:", counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
