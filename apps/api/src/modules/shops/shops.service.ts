import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { CreateShopDto } from "./shops.schemas";

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  /**
   * Platform admins belong to no shop, so they get null rather than an error:
   * the caller decides how to present "not attached to a shop".
   */
  async findForUser(actor: AuthUser) {
    if (!actor.shopId) return null;
    return this.prisma.shop.findUnique({
      where: { id: actor.shopId },
      select: { id: true, name: true, defaultLanguage: true, currency: true, timezone: true }
    });
  }

  async create(input: CreateShopDto, actor: AuthUser) {
    if (actor.role !== UserRole.admin) throw new AppError("Only platform admins can create shops", 403);
    return this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({ data: input });
      await this.audit.create(tx, {
        shopId: shop.id,
        actorUserId: actor.id,
        action: "shop.created",
        entityType: "shop",
        entityId: shop.id,
        source: "api",
        afterData: { name: shop.name, gstNumber: shop.gstNumber }
      });
      return shop;
    });
  }
}
