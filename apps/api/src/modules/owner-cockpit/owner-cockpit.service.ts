import { Injectable } from "@nestjs/common";
import { PaymentMethod, PendingPaymentStatus, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { SalesService } from "@/modules/sales/sales.service";
import { OwnerCockpitQueryDto } from "./owner-cockpit.schemas";

const supportedQueries = [
  "today_sales",
  "pending_payments",
  "cash_collected_today",
  "sales_between_dates",
  "customer_purchase_summary",
  "stock_count_summary",
  "weekly_analytics",
  "metal_split",
  "top_customers",
  "schemes_maturing"
];

@Injectable()
export class OwnerCockpitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly audit: AuditLogsService
  ) {}

  async query(input: OwnerCockpitQueryDto, actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Owner Cockpit is owner-only", 403);
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    await this.audit.create(this.prisma, {
      shopId: actor.shopId,
      actorUserId: actor.id,
      action: "owner_cockpit.query_executed",
      entityType: "owner_cockpit",
      source: "owner_cockpit",
      afterData: { question: input.question }
    });
    const q = input.question.toLowerCase();
    if (q.includes("today") && (q.includes("sell") || q.includes("sale"))) {
      const summary = await this.sales.todaySummary(actor.shopId);
      const cards: Array<{ type: string; data: unknown }> = [{ type: "today_sales_summary", data: summary }];
      if (q.includes("pending") || q.includes("not paid")) cards.push({ type: "pending_customers", data: await this.pendingPayments(actor.shopId) });
      return {
        answer: `Today you sold Rs ${summary.totalAmount} across ${summary.totalSales} sale(s). Cash collected is Rs ${summary.cashCollected}. Pending amount is Rs ${summary.pendingAmount}.`,
        cards
      };
    }
    if (q.includes("pending") || q.includes("not paid")) {
      const pending = await this.pendingPayments(actor.shopId);
      const total = pending.reduce((sum, row: any) => sum.plus(row.amount), new Decimal(0)).toString();
      return { answer: `Pending payment total is Rs ${total} across ${pending.length} record(s).`, cards: [{ type: "pending_customers", data: pending }] };
    }
    if (q.includes("cash") && q.includes("today")) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const cash = await this.prisma.payment.aggregate({ where: { shopId: actor.shopId, paymentMethod: PaymentMethod.cash, paymentDate: { gte: start, lte: end } }, _sum: { amount: true } });
      const amount = new Decimal(cash._sum.amount ?? 0).toString();
      return { answer: `Cash collected today is Rs ${amount}.`, cards: [{ type: "cash_collected_today", data: { amount } }] };
    }
    if (q.includes("between") && input.dateFrom && input.dateTo) {
      const sales = await this.prisma.sale.findMany({ where: { shopId: actor.shopId, saleDate: { gte: input.dateFrom, lte: input.dateTo } } });
      const total = sales.reduce((sum, sale) => sum.plus(sale.totalAmount), new Decimal(0)).toString();
      return { answer: `Sales between ${input.dateFrom.toISOString().slice(0, 10)} and ${input.dateTo.toISOString().slice(0, 10)} are Rs ${total} across ${sales.length} sale(s).`, cards: [{ type: "sales_between_dates", data: { count: sales.length, totalAmount: total } }] };
    }
    if (q.includes("analytics") || q.includes("trend") || q.includes("week") || q.includes("compare")) {
      const analytics = await this.analytics(actor.shopId, input.dateFrom, input.dateTo);
      return {
        answer: `Revenue is Rs ${analytics.totalRevenue} across ${analytics.totalSales} sale(s). Gold weight sold is ${analytics.goldWeightSold} g and silver weight sold is ${analytics.silverWeightSold} g.`,
        cards: [
          { type: "period_summary", data: analytics.summary },
          { type: "sales_trend", data: analytics.trend },
          { type: "metal_split", data: analytics.metalSplit },
          { type: "top_customers", data: analytics.topCustomers }
        ]
      };
    }
    if (q.includes("top customer")) {
      const analytics = await this.analytics(actor.shopId, input.dateFrom, input.dateTo);
      return { answer: `Top customer is ${analytics.topCustomers[0]?.customerName ?? "not available"} for Rs ${analytics.topCustomers[0]?.totalAmount ?? "0"}.`, cards: [{ type: "top_customers", data: analytics.topCustomers }] };
    }
    if (q.includes("scheme") && (q.includes("mature") || q.includes("maturing"))) {
      const schemes = await this.schemesMaturing(actor.shopId);
      return { answer: `${schemes.length} scheme(s) mature in the next 30 days.`, cards: [{ type: "schemes_maturing", data: schemes }] };
    }
    if (q.includes("customer") && input.customerId) {
      const summary = await this.customerSummary(actor.shopId, input.customerId);
      return { answer: `${summary.customer.fullName} has purchased Rs ${summary.totalPurchased} across ${summary.totalSales} sale(s). Pending amount is Rs ${summary.pendingAmount}.`, cards: [{ type: "customer_purchase_summary", data: summary }] };
    }
    if (q.includes("stock") || q.includes("inventory")) {
      const summary = await this.stockSummary(actor.shopId);
      return { answer: `Current stock count is ${summary.totalCount} item(s), with ${summary.availableCount} available. Estimated available value is Rs ${summary.availableValue}.`, cards: [{ type: "stock_count_summary", data: summary }] };
    }
    return { answer: "I cannot answer this yet.", supportedQueries };
  }

  private pendingPayments(shopId: string) {
    return this.prisma.pendingPayment.findMany({
      where: { shopId, status: { in: [PendingPaymentStatus.open, PendingPaymentStatus.partially_paid] } },
      select: { id: true, saleId: true, customerId: true, amount: true, status: true }
    });
  }

  private async analytics(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const range = this.range(dateFrom, dateTo);
    const sales = await this.prisma.sale.findMany({
      where: { shopId, saleDate: { gte: range.start, lte: range.end } },
      include: { customer: true, items: true },
      orderBy: { saleDate: "asc" }
    });
    const totalRevenue = sales.reduce((sum, sale) => sum.plus(sale.totalAmount), new Decimal(0));
    const totalPending = sales.reduce((sum, sale) => sum.plus(sale.pendingAmount), new Decimal(0));
    const itemRows = sales.flatMap((sale) => sale.items);
    const metalSplit = this.groupMetalSplit(itemRows);
    const trend = this.groupSalesByDate(sales);
    const topCustomers = this.topCustomers(sales);
    return {
      totalRevenue: totalRevenue.toString(),
      totalSales: sales.length,
      totalPending: totalPending.toString(),
      goldWeightSold: metalSplit.gold?.weight ?? "0",
      silverWeightSold: metalSplit.silver?.weight ?? "0",
      summary: {
        dateFrom: range.start.toISOString().slice(0, 10),
        dateTo: range.end.toISOString().slice(0, 10),
        totalRevenue: totalRevenue.toString(),
        totalSales: sales.length,
        totalPending: totalPending.toString(),
        piecesSold: itemRows.length
      },
      trend,
      metalSplit,
      topCustomers
    };
  }

  private async customerSummary(shopId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new AppError("Customer not found", 404);
    const sales = await this.prisma.sale.findMany({ where: { shopId, customerId }, include: { items: true } });
    const pending = await this.prisma.pendingPayment.findMany({ where: { shopId, customerId, status: { in: [PendingPaymentStatus.open, PendingPaymentStatus.partially_paid] } } });
    return {
      customer,
      totalSales: sales.length,
      totalPurchased: sales.reduce((sum, sale) => sum.plus(sale.totalAmount), new Decimal(0)).toString(),
      pendingAmount: pending.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toString(),
      piecesPurchased: sales.reduce((sum, sale) => sum + sale.items.length, 0)
    };
  }

  private async stockSummary(shopId: string) {
    const items = await this.prisma.inventoryItem.findMany({ where: { shopId } });
    const available = items.filter((item) => item.status === "available");
    const byStatus = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      totalCount: items.length,
      availableCount: available.length,
      availableValue: available.reduce((sum, item) => sum.plus(item.estimatedValue ?? 0), new Decimal(0)).toString(),
      byStatus
    };
  }

  private async schemesMaturing(shopId: string) {
    const today = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return this.prisma.savingsScheme.findMany({
      where: { shopId, status: "active", maturityDate: { gte: today, lte: end } },
      include: { customer: true, installments: true },
      orderBy: { maturityDate: "asc" },
      take: 50
    });
  }

  private groupSalesByDate(sales: Array<{ saleDate: Date; totalAmount: Decimal.Value }>) {
    const rows = new Map<string, { date: string; totalAmount: Decimal; totalSales: number }>();
    for (const sale of sales) {
      const date = sale.saleDate.toISOString().slice(0, 10);
      const row = rows.get(date) ?? { date, totalAmount: new Decimal(0), totalSales: 0 };
      row.totalAmount = row.totalAmount.plus(sale.totalAmount);
      row.totalSales += 1;
      rows.set(date, row);
    }
    return [...rows.values()].map((row) => ({ date: row.date, totalAmount: row.totalAmount.toString(), totalSales: row.totalSales }));
  }

  private groupMetalSplit(items: Array<{ purity: string; netWeight: Decimal.Value; lineTotal: Decimal.Value }>) {
    const rows: Record<string, { weight: Decimal; amount: Decimal; pieces: number }> = {};
    for (const item of items) {
      const metal = item.purity.toLowerCase().includes("silver") ? "silver" : item.purity.toLowerCase().includes("diamond") ? "diamond" : "gold";
      const row = rows[metal] ?? { weight: new Decimal(0), amount: new Decimal(0), pieces: 0 };
      row.weight = row.weight.plus(item.netWeight);
      row.amount = row.amount.plus(item.lineTotal);
      row.pieces += 1;
      rows[metal] = row;
    }
    return Object.fromEntries(Object.entries(rows).map(([metal, row]) => [metal, { weight: row.weight.toFixed(3), amount: row.amount.toString(), pieces: row.pieces }]));
  }

  private topCustomers(sales: Array<{ customerId: string | null; customer: { fullName: string } | null; totalAmount: Decimal.Value }>) {
    const rows = new Map<string, { customerId: string | null; customerName: string; totalAmount: Decimal; totalSales: number }>();
    for (const sale of sales) {
      const key = sale.customerId ?? "walk-in";
      const row = rows.get(key) ?? { customerId: sale.customerId, customerName: sale.customer?.fullName ?? "Walk-in Customer", totalAmount: new Decimal(0), totalSales: 0 };
      row.totalAmount = row.totalAmount.plus(sale.totalAmount);
      row.totalSales += 1;
      rows.set(key, row);
    }
    return [...rows.values()]
      // Deterministic tie-break: on equal spend, the more frequent buyer wins, then
      // alphabetical by name, so "top customer" is stable rather than DB-order luck.
      .sort((a, b) =>
        b.totalAmount.comparedTo(a.totalAmount) ||
        b.totalSales - a.totalSales ||
        a.customerName.localeCompare(b.customerName)
      )
      .slice(0, 10)
      .map((row) => ({ customerId: row.customerId, customerName: row.customerName, totalAmount: row.totalAmount.toString(), totalSales: row.totalSales }));
  }

  private range(dateFrom?: Date, dateTo?: Date) {
    const end = dateTo ? new Date(dateTo) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = dateFrom ? new Date(dateFrom) : new Date(end);
    if (!dateFrom) start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
}
