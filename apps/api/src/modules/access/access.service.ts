import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AccessUpsertDto } from "./access.schemas";

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async list(actor: AuthUser, userId?: string) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    return this.prisma.userSectionAccess.findMany({ where: { shopId, userId }, include: { user: true }, orderBy: [{ userId: "asc" }, { section: "asc" }] });
  }

  async upsert(actor: AuthUser, input: AccessUpsertDto) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    const target = await this.prisma.user.findFirst({ where: { id: input.userId, shopId } });
    if (!target) throw new AppError("User not found", 404);
    const access = await this.prisma.userSectionAccess.upsert({
      where: { userId_section: { userId: input.userId, section: input.section } },
      create: { shopId, userId: input.userId, section: input.section, canAccess: input.canAccess },
      update: { canAccess: input.canAccess }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "user_section_access.updated", entityType: "user_section_access", entityId: access.id, source: "access_api", afterData: { userId: access.userId, section: access.section, canAccess: access.canAccess } });
    return access;
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireOwner(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
  }
}
