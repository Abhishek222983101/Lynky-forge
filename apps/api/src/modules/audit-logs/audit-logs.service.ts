import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";

type Db = PrismaService | Prisma.TransactionClient | PrismaClient;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(db: Db, input: {
    shopId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    beforeData?: Prisma.InputJsonValue;
    afterData?: Prisma.InputJsonValue;
    source: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    return db.auditLog.create({
      data: {
        shopId: input.shopId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeData: input.beforeData ?? undefined,
        afterData: input.afterData ?? undefined,
        source: input.source,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }
}
