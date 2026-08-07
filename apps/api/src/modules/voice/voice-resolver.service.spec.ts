import { PrismaService } from "@/common/database/prisma.service";
import { VoiceResolverService } from "./voice-resolver.service";

const SHOP = "shop-1";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const REPAIR_ID = "22222222-2222-2222-2222-222222222222";
const INVOICE_ID = "33333333-3333-3333-3333-333333333333";

function prismaMock(overrides: Record<string, any> = {}) {
  return {
    customer: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    repairOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    savingsScheme: { findFirst: jest.fn().mockResolvedValue(null) },
    invoice: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides
  } as unknown as PrismaService;
}

describe("VoiceResolverService", () => {
  it("resolves a unique customer name to a customerId", async () => {
    const prisma = prismaMock({ customer: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([{ id: CUSTOMER_ID, fullName: "Lakshmi", phone: null }]) } });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve("create_repair_order", { customerName: "Lakshmi", itemDescription: "gold chain" }, SHOP);

    expect(result.ok).toBe(true);
    expect(result.ok && result.arguments.customerId).toBe(CUSTOMER_ID);
  });

  it("asks which customer when the name is ambiguous", async () => {
    const prisma = prismaMock({ customer: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([
      { id: CUSTOMER_ID, fullName: "Lakshmi Narayan", phone: "9876500001" },
      { id: "b", fullName: "Lakshmi Priya", phone: "9876500002" }
    ]) } });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve("create_scheme", { customerName: "Lakshmi" }, SHOP);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.clarification).toContain("more than one");
  });

  it("clarifies when no customer matches", async () => {
    const resolver = new VoiceResolverService(prismaMock());
    const result = await resolver.resolve("create_repair_order", { customerName: "Nobody" }, SHOP);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.clarification).toContain("could not find");
  });

  it("resolves the customer's latest open repair for a status update", async () => {
    const prisma = prismaMock({
      customer: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([{ id: CUSTOMER_ID, fullName: "Lakshmi", phone: null }]) },
      repairOrder: { findFirst: jest.fn().mockResolvedValue({ id: REPAIR_ID }) }
    });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve("update_repair_status", { customerName: "Lakshmi", status: "ready" }, SHOP);

    expect(result.ok).toBe(true);
    expect(result.ok && result.arguments.repairOrderId).toBe(REPAIR_ID);
  });

  it("resolves an invoice by number", async () => {
    const prisma = prismaMock({ invoice: { findFirst: jest.fn().mockResolvedValue({ id: INVOICE_ID }) } });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve("generate_invoice_pdf", { invoiceNumber: "INV-000042" }, SHOP);

    expect(result.ok).toBe(true);
    expect(result.ok && result.arguments.invoiceId).toBe(INVOICE_ID);
  });

  it("allows an anonymous buyback seller (no customer reference)", async () => {
    const resolver = new VoiceResolverService(prismaMock());
    const result = await resolver.resolve("create_buyback_item", { itemName: "old chain", testedPurity: "22K", weight: "10", ratePerGram: "6000" }, SHOP);
    expect(result.ok).toBe(true);
  });

  it("resolves a karigar name to a karigarId when issuing a job", async () => {
    const KARIGAR_ID = "44444444-4444-4444-4444-444444444444";
    const prisma = prismaMock({
      karigar: { findMany: jest.fn().mockResolvedValue([{ id: KARIGAR_ID, name: "Ravi" }]) }
    });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve(
      "issue_karigar_job",
      { karigarName: "Ravi", itemDescription: "rope chain", purity: "22K", issuedWeight: "50" },
      SHOP
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.arguments.karigarId).toBe(KARIGAR_ID);
  });

  it("resolves the karigar's latest open job (with issued weight) for a return", async () => {
    const KARIGAR_ID = "44444444-4444-4444-4444-444444444444";
    const JOB_ID = "55555555-5555-5555-5555-555555555555";
    const prisma = prismaMock({
      karigar: { findMany: jest.fn().mockResolvedValue([{ id: KARIGAR_ID, name: "Ravi" }]) },
      karigarJob: { findFirst: jest.fn().mockResolvedValue({ id: JOB_ID, issuedWeight: "50", itemDescription: "rope chain" }) }
    });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve("record_karigar_return", { karigarName: "Ravi", finishedWeight: "48", scrapWeight: "1.5" }, SHOP);

    expect(result.ok).toBe(true);
    expect(result.ok && result.arguments.jobId).toBe(JOB_ID);
    expect(result.ok && result.arguments.issuedWeight).toBe("50");
  });

  it("clarifies when the karigar has no open job", async () => {
    const prisma = prismaMock({
      karigar: { findMany: jest.fn().mockResolvedValue([{ id: "k", name: "Ravi" }]) },
      karigarJob: { findFirst: jest.fn().mockResolvedValue(null) }
    });
    const resolver = new VoiceResolverService(prisma);
    const result = await resolver.resolve("record_karigar_return", { karigarName: "Ravi", finishedWeight: "48" }, SHOP);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.clarification).toContain("open job");
  });

  it("resolves an inventory item by name for a content request", async () => {
    const ITEM_ID = "66666666-6666-6666-6666-666666666666";
    const prisma = prismaMock({
      inventoryItem: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([{ id: ITEM_ID, name: "Temple necklace" }]) }
    });
    const resolver = new VoiceResolverService(prisma);

    const result = await resolver.resolve("create_content_request", { itemName: "temple", occasion: "Diwali" }, SHOP);

    expect(result.ok).toBe(true);
    expect(result.ok && result.arguments.inventoryItemId).toBe(ITEM_ID);
  });
});
