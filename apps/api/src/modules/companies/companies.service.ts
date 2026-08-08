import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { CreateCompanyDto, CreateContactDto, ListCompaniesQueryDto, UpdateCompanyDto, UpdateContactDto } from "./companies.schemas";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async create(input: CreateCompanyDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          shopId,
          name: input.name,
          industry: input.industry,
          city: input.city,
          size: input.size,
          website: input.website,
          annualPotential: input.annualPotential,
          source: input.source,
          tags: input.tags ?? undefined,
          notes: input.notes
        }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "company.created",
        entityType: "company",
        entityId: company.id,
        source: "api",
        afterData: { name: company.name, industry: company.industry }
      });
      return company;
    });
  }

  async list(query: ListCompaniesQueryDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const where: Prisma.CompanyWhereInput = { shopId };
    if (query.industry) where.industry = query.industry;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { city: { contains: query.q, mode: "insensitive" } }
      ];
    }
    return this.prisma.company.findMany({
      where,
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
        _count: { select: { deals: true } }
      },
      orderBy: { name: "asc" }
    });
  }

  /**
   * Company 360 — single company plus whichever relations the caller asks
   * for via ?include=deals,contacts,activities,tasks. One round trip.
   */
  async findOne(id: string, include: string | undefined, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const requested = new Set((include ?? "").split(",").map((s) => s.trim()).filter(Boolean));

    const company = await this.prisma.company.findFirst({
      where: { id, shopId },
      include: {
        contacts: requested.has("contacts") ? { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } : false,
        deals: requested.has("deals")
          ? { orderBy: { updatedAt: "desc" }, include: { quote: { select: { id: true, quoteNo: true, status: true } } } }
          : false,
        activities: requested.has("activities") ? { orderBy: { createdAt: "desc" }, take: 50 } : false,
        tasks: requested.has("tasks") ? { orderBy: { dueAt: "asc" } } : false
      }
    });
    if (!company) throw new AppError("Company not found", 404);
    return company;
  }

  async update(id: string, input: UpdateCompanyDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    await this.ensureExists(id, shopId);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id },
        data: {
          name: input.name,
          industry: input.industry,
          city: input.city,
          size: input.size,
          website: input.website,
          annualPotential: input.annualPotential,
          source: input.source,
          tags: input.tags ?? undefined,
          notes: input.notes
        }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "company.updated",
        entityType: "company",
        entityId: company.id,
        source: "api",
        afterData: { name: company.name }
      });
      return company;
    });
  }

  async addContact(companyId: string, input: CreateContactDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    await this.ensureExists(companyId, shopId);
    return this.prisma.$transaction(async (tx) => {
      // Only one primary contact per company — demote others first.
      if (input.isPrimary) {
        await tx.contact.updateMany({ where: { companyId, isPrimary: true }, data: { isPrimary: false } });
      }
      const contact = await tx.contact.create({
        data: { shopId, companyId, ...input }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "contact.created",
        entityType: "contact",
        entityId: contact.id,
        source: "api",
        afterData: { companyId, name: contact.name, isPrimary: contact.isPrimary }
      });
      return contact;
    });
  }

  async listContacts(companyId: string, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    await this.ensureExists(companyId, shopId);
    return this.prisma.contact.findMany({
      where: { companyId, shopId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }]
    });
  }

  async updateContact(contactId: string, input: UpdateContactDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const existing = await this.prisma.contact.findFirst({ where: { id: contactId, shopId } });
    if (!existing) throw new AppError("Contact not found", 404);
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.contact.updateMany({ where: { companyId: existing.companyId, isPrimary: true }, data: { isPrimary: false } });
      }
      const contact = await tx.contact.update({ where: { id: contactId }, data: input });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "contact.updated",
        entityType: "contact",
        entityId: contact.id,
        source: "api",
        afterData: { name: contact.name, isPrimary: contact.isPrimary }
      });
      return contact;
    });
  }

  private async ensureExists(id: string, shopId: string) {
    const company = await this.prisma.company.findFirst({ where: { id, shopId }, select: { id: true } });
    if (!company) throw new AppError("Company not found", 404);
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}
