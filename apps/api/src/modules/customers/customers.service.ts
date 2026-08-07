import { Injectable } from "@nestjs/common";
import { CustomerType, FollowUpStatus, Prisma, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { toCsv } from "@/modules/accounting/csv";
import { CustomerCreateDto, CustomerImportDto, CustomerListQuery, CustomerUpdateDto, DistributorOrderCreateDto, FollowUpCreateDto, FollowUpListQuery, FollowUpStatusDto } from "./customers.schemas";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async create(actor: AuthUser, input: CustomerCreateDto) {
    const shopId = this.requireShop(actor);
    const customer = await this.prisma.customer.create({ data: this.customerCreateData(shopId, input) });
    await this.audit.create(this.prisma, {
      shopId,
      actorUserId: actor.id,
      action: "customer.created",
      entityType: "customer",
      entityId: customer.id,
      source: "customers_api",
      afterData: { fullName: customer.fullName, phone: customer.phone, customerType: customer.customerType }
    });
    return customer;
  }

  list(actor: AuthUser, query: CustomerListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.customer.findMany({
      where: {
        shopId,
        customerType: query.customerType,
        OR: query.q ? [
          { fullName: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q, mode: "insensitive" } },
          { companyName: { contains: query.q, mode: "insensitive" } }
        ] : undefined
      },
      orderBy: { updatedAt: "desc" },
      take: 200
    });
  }

  async importCustomers(actor: AuthUser, input: CustomerImportDto) {
    const shopId = this.requireShop(actor);
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      const customers = [];
      for (const row of input.rows) {
        const data = this.customerCreateData(shopId, row);
        if (row.phone) {
          const existing = await tx.customer.findFirst({ where: { shopId, phone: row.phone } });
          if (existing) {
            const customer = await tx.customer.update({ where: { id: existing.id }, data: { ...this.customerUpdateData(row), importedAt: new Date() } });
            customers.push(customer);
            updated += 1;
            continue;
          }
        }
        const customer = await tx.customer.create({ data: { ...data, importedAt: new Date() } });
        customers.push(customer);
        created += 1;
      }
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "customers.imported",
        entityType: "customer",
        source: "customers_api",
        afterData: { created, updated, totalRows: input.rows.length }
      });
      return { created, updated, customers };
    });
    return result;
  }

  async exportCustomers(actor: AuthUser, query: CustomerListQuery) {
    const rows = await this.list(actor, query);
    return toCsv(rows.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      customerType: customer.customerType,
      companyName: customer.companyName ?? "",
      preferredLanguage: customer.preferredLanguage ?? "",
      birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : "",
      anniversaryDate: customer.anniversaryDate ? customer.anniversaryDate.toISOString().slice(0, 10) : "",
      messageOptIn: customer.messageOptIn,
      notes: customer.notes ?? ""
    })));
  }

  async get(actor: AuthUser, customerId: string) {
    const shopId = this.requireShop(actor);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, shopId },
      include: {
        sales: { orderBy: { saleDate: "desc" }, take: 20, include: { invoice: true, pendingPayment: true } },
        followUps: { orderBy: { dueAt: "asc" }, take: 20 },
        savingsSchemes: { include: { installments: true }, orderBy: { createdAt: "desc" } },
        repairOrders: { orderBy: { createdAt: "desc" }, take: 20 },
        distributorOrders: { orderBy: { createdAt: "desc" }, take: 20 }
      }
    });
    if (!customer) throw new AppError("Customer not found", 404);
    return customer;
  }

  async update(actor: AuthUser, customerId: string, input: CustomerUpdateDto) {
    const shopId = this.requireShop(actor);
    const existing = await this.prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!existing) throw new AppError("Customer not found", 404);
    const customer = await this.prisma.customer.update({ where: { id: existing.id }, data: this.customerUpdateData(input) });
    await this.audit.create(this.prisma, {
      shopId,
      actorUserId: actor.id,
      action: "customer.updated",
      entityType: "customer",
      entityId: customer.id,
      source: "customers_api",
      beforeData: { fullName: existing.fullName, phone: existing.phone, customerType: existing.customerType },
      afterData: { fullName: customer.fullName, phone: customer.phone, customerType: customer.customerType }
    });
    return customer;
  }

  async summary(actor: AuthUser, customerId: string) {
    const shopId = this.requireShop(actor);
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new AppError("Customer not found", 404);
    const [sales, pending, followUps] = await Promise.all([
      this.prisma.sale.findMany({ where: { shopId, customerId }, include: { items: true } }),
      this.prisma.pendingPayment.findMany({ where: { shopId, customerId, status: { in: ["open", "partially_paid"] } } }),
      this.prisma.customerFollowUp.findMany({ where: { shopId, customerId, status: { in: [FollowUpStatus.due, FollowUpStatus.scheduled] } }, orderBy: { dueAt: "asc" } })
    ]);
    return {
      customer,
      totalSales: sales.length,
      totalPurchased: sales.reduce((sum, sale) => sum.plus(sale.totalAmount), new Decimal(0)).toString(),
      pendingAmount: pending.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toString(),
      piecesPurchased: sales.reduce((sum, sale) => sum + sale.items.length, 0),
      lastPurchaseDate: sales.length ? sales.reduce((latest, sale) => sale.saleDate > latest ? sale.saleDate : latest, sales[0].saleDate).toISOString().slice(0, 10) : null,
      favoritePurities: this.rankValues(sales.flatMap((sale) => sale.items.map((item) => item.purity))),
      favoriteCategories: this.rankValues(sales.flatMap((sale) => sale.items.map((item) => item.itemName))),
      upcomingFollowUps: followUps
    };
  }

  async createFollowUp(actor: AuthUser, input: FollowUpCreateDto) {
    const shopId = this.requireShop(actor);
    await this.assertCustomer(shopId, input.customerId);
    const followUp = await this.prisma.customerFollowUp.create({
      data: {
        shopId,
        customerId: input.customerId,
        type: input.type,
        dueAt: input.dueAt,
        message: input.message ?? undefined,
        metadata: input.metadata as Prisma.InputJsonValue ?? undefined,
        createdBy: actor.id
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "customer_follow_up.created", entityType: "customer_follow_up", entityId: followUp.id, source: "customers_api", afterData: { customerId: followUp.customerId, type: followUp.type, dueAt: followUp.dueAt.toISOString() } });
    return followUp;
  }

  listFollowUps(actor: AuthUser, query: FollowUpListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.customerFollowUp.findMany({
      where: { shopId, customerId: query.customerId, status: query.status },
      include: { customer: true },
      orderBy: { dueAt: "asc" },
      take: 200
    });
  }

  async updateFollowUpStatus(actor: AuthUser, followUpId: string, input: FollowUpStatusDto) {
    const shopId = this.requireShop(actor);
    const existing = await this.prisma.customerFollowUp.findFirst({ where: { id: followUpId, shopId } });
    if (!existing) throw new AppError("Follow-up not found", 404);
    const followUp = await this.prisma.customerFollowUp.update({ where: { id: existing.id }, data: { status: input.status } });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "customer_follow_up.status_updated", entityType: "customer_follow_up", entityId: followUp.id, source: "customers_api", beforeData: { status: existing.status }, afterData: { status: followUp.status } });
    return followUp;
  }

  async createDistributorOrder(actor: AuthUser, input: DistributorOrderCreateDto) {
    const shopId = this.requireShop(actor);
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
    const customer = await this.assertCustomer(shopId, input.customerId);
    if (customer.customerType !== CustomerType.wholesale) throw new AppError("Distributor orders require a wholesale customer", 422);
    const order = await this.prisma.distributorOrder.create({
      data: {
        shopId,
        customerId: input.customerId,
        orderNumber: `WO-${Date.now().toString(36).toUpperCase()}`,
        metal: input.metal,
        ornamentType: input.ornamentType,
        quantityWeight: input.quantityWeight,
        orderValue: input.orderValue,
        paymentStatus: input.paymentStatus,
        notes: input.notes ?? undefined,
        createdBy: actor.id
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "distributor_order.created", entityType: "distributor_order", entityId: order.id, source: "customers_api", afterData: { customerId: order.customerId, orderValue: order.orderValue.toString() } });
    return order;
  }

  listDistributorOrders(actor: AuthUser, customerId?: string) {
    const shopId = this.requireShop(actor);
    return this.prisma.distributorOrder.findMany({ where: { shopId, customerId }, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  private async assertCustomer(shopId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new AppError("Customer not found", 404);
    return customer;
  }

  private customerCreateData(shopId: string, input: CustomerCreateDto): Prisma.CustomerUncheckedCreateInput {
    return {
      shopId,
      fullName: input.fullName,
      phone: input.phone ?? undefined,
      customerType: input.customerType,
      companyName: input.companyName ?? undefined,
      preferredLanguage: input.preferredLanguage ?? undefined,
      birthday: input.birthday ?? undefined,
      anniversaryDate: input.anniversaryDate ?? undefined,
      tags: input.tags as Prisma.InputJsonValue ?? undefined,
      preferences: input.preferences as Prisma.InputJsonValue ?? undefined,
      messageOptIn: input.messageOptIn,
      consentAt: input.messageOptIn ? new Date() : undefined,
      notes: input.notes ?? undefined
    };
  }

  private customerUpdateData(input: CustomerUpdateDto): Prisma.CustomerUncheckedUpdateInput {
    return {
      fullName: input.fullName,
      phone: input.phone ?? undefined,
      customerType: input.customerType,
      companyName: input.companyName ?? undefined,
      preferredLanguage: input.preferredLanguage ?? undefined,
      birthday: input.birthday ?? undefined,
      anniversaryDate: input.anniversaryDate ?? undefined,
      tags: input.tags as Prisma.InputJsonValue ?? undefined,
      preferences: input.preferences as Prisma.InputJsonValue ?? undefined,
      messageOptIn: input.messageOptIn,
      consentAt: input.messageOptIn ? new Date() : undefined,
      notes: input.notes ?? undefined
    };
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private rankValues(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
  }
}
