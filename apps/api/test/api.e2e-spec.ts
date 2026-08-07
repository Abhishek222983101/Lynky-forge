import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

const request = require("supertest");

const e2eUrl = process.env.E2E_DATABASE_URL;
const describeE2e = e2eUrl ? describe : describe.skip;

describeE2e("Sornam API e2e", () => {
  let app: any;
  let prisma: any;
  let adminToken: string;
  let ownerToken: string;
  let salesToken: string;
  let shopId: string;

  const manualSalePayload = {
    customer: { fullName: "Lakshmi", phone: "9999999999" },
    items: [{
      itemName: "chain",
      purity: "22K",
      grossWeight: "18.5",
      netWeight: "18.5",
      goldRatePerGram: "6000",
      makingChargeType: "percentage",
      makingChargeValue: "12",
    }],
    amountPaid: "50000",
    paymentMethod: "cash",
  };

  beforeAll(async () => {
    if (!e2eUrl) return;
    if (!/test|localhost|127\.0\.0\.1/.test(e2eUrl)) {
      throw new Error("Refusing to run e2e cleanup unless E2E_DATABASE_URL contains test, localhost, or 127.0.0.1");
    }
    process.env.DATABASE_URL = e2eUrl;
    process.env.JWT_SECRET = "e2e-secret-change-me";
    process.env.JWT_EXPIRES_IN = "12h";
    process.env.GOLD_RATE_PROVIDER = "static_configured";
    process.env.GOLD_RATE_STATIC_22K = "6000";
    process.env.APP_ENV = "test";

    const [{ Test }, { AppModule }, { PrismaService }] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module"),
      import("../src/common/database/prisma.service"),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = app.get(PrismaService);
    await cleanDatabase();
    await prisma.user.create({
      data: {
        fullName: "Platform Admin",
        email: "admin-e2e@sornam.local",
        passwordHash: await bcrypt.hash("password12345", 12),
        role: UserRole.admin,
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("logs in as admin, creates a shop and users", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "admin-e2e@sornam.local", password: "password12345" })
      .expect(201);
    adminToken = login.body.accessToken;

    const shop = await request(app.getHttpServer())
      .post("/api/v1/shops")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sornam E2E" })
      .expect(201);
    shopId = shop.body.id;

    await request(app.getHttpServer())
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ shopId, fullName: "Owner E2E", email: "owner-e2e@sornam.local", password: "password12345", role: "owner" })
      .expect(201);

    const ownerLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "owner-e2e@sornam.local", password: "password12345" })
      .expect(201);
    ownerToken = ownerLogin.body.accessToken;

    await request(app.getHttpServer())
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ shopId, fullName: "Sales E2E", email: "sales-e2e@sornam.local", password: "password12345", role: "salesperson" })
      .expect(201);

    const salesLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "sales-e2e@sornam.local", password: "password12345" })
      .expect(201);
    salesToken = salesLogin.body.accessToken;
  });

  it("creates manual sales with transaction-safe sequential numbers", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/v1/sales/manual")
      .set("Authorization", `Bearer ${salesToken}`)
      .send(manualSalePayload)
      .expect(201);

    expect(first.body.saleNumber).toBe("S-000001");
    expect(first.body.invoice.invoiceNumber).toBe("INV-000001");
    expect(first.body.pendingPayment.amount).toBe("78049.6");

    const second = await request(app.getHttpServer())
      .post("/api/v1/sales/manual")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ ...manualSalePayload, customer: { fullName: "Meena", phone: "8888888888" } })
      .expect(201);

    expect(second.body.saleNumber).toBe("S-000002");
    expect(second.body.invoice.invoiceNumber).toBe("INV-000002");
  });

  it("does not save voice sale before confirmation and saves transactionally after confirmation", async () => {
    const before = await prisma.sale.count({ where: { shopId } });
    const session = await request(app.getHttpServer())
      .post("/api/v1/voice/sessions")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        source: "app_speak",
        transcript: "Sold 22 carat chain 18.5 grams making 12 percent to Lakshmi. Received 50000 cash rest pending.",
      })
      .expect(201);

    expect(session.body.status).toBe("awaiting_confirmation");
    await expect(prisma.sale.count({ where: { shopId } })).resolves.toBe(before);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/voice/sessions/${session.body.sessionId}/confirm`)
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ confirmation: "yes" })
      .expect(201);

    expect(confirmed.body.status).toBe("confirmed");
    expect(confirmed.body.sale.saleNumber).toBe("S-000003");
    await expect(prisma.pendingPayment.count({ where: { shopId } })).resolves.toBe(3);
    await expect(prisma.auditLog.count({ where: { shopId, action: "sale.created" } })).resolves.toBe(3);
  });

  it("prevents cross-shop sale access", async () => {
    const otherShop = await prisma.shop.create({ data: { name: "Other Shop" } });
    await prisma.user.create({
      data: {
        shopId: otherShop.id,
        fullName: "Other Owner",
        email: "other-owner-e2e@sornam.local",
        passwordHash: await bcrypt.hash("password12345", 12),
        role: UserRole.owner,
      },
    });
    const otherLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "other-owner-e2e@sornam.local", password: "password12345" })
      .expect(201);
    const sale = await prisma.sale.findFirstOrThrow({ where: { shopId } });

    await request(app.getHttpServer())
      .get(`/api/v1/sales/${sale.id}`)
      .set("Authorization", `Bearer ${otherLogin.body.accessToken}`)
      .expect(404);
  });

  async function cleanDatabase() {
    await prisma.internalEvent.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.voiceSession.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.pendingPayment.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.saleCounter.deleteMany();
    await prisma.user.deleteMany();
    await prisma.shop.deleteMany();
  }
});
