import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { CreateUserDto } from "./users.schemas";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async create(input: CreateUserDto, actor: AuthUser) {
    if (actor.role !== UserRole.admin && !(actor.role === UserRole.owner && actor.shopId === input.shopId)) {
      throw new AppError("Insufficient permissions", 403);
    }
    if (input.role !== UserRole.admin && !input.shopId) throw new AppError("Non-admin users must belong to a shop");
    if (input.email && (await this.prisma.user.findUnique({ where: { email: input.email } }))) {
      throw new AppError("Email already exists", 409);
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          shopId: input.shopId ?? null,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: input.role
        }
      });
      await this.audit.create(tx, {
        shopId: user.shopId,
        actorUserId: actor.id,
        action: "user.created",
        entityType: "user",
        entityId: user.id,
        source: "api",
        afterData: { fullName: user.fullName, email: user.email, role: user.role }
      });
      const { passwordHash, ...safe } = user;
      return safe;
    });
  }
}
