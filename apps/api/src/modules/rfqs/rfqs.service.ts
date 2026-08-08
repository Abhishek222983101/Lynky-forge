import { Injectable } from "@nestjs/common";
import { ActivityType, DealSource, DealStage } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { CreateRfqDto, ListRfqsQueryDto } from "./rfqs.schemas";

@Injectable()
export class RfqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  /**
   * RFQ intake is a 3-step chain, always atomic:
   *   1. Resolve or create the Company
   *   2. Create a Deal in NEW_RFQ stage
   *   3. Create the RFQ linked to that deal
   * Returns { company, deal, rfq } so the frontend can deep-link anywhere.
   */
  async create(input: CreateRfqDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);

    return this.prisma.$transaction(async (tx) => {
      // 1. Company — use existing or create new
      let companyId: string;
      let companyName: string;
      if (input.companyId) {
        const company = await tx.company.findFirst({ where: { id: input.companyId, shopId } });
        if (!company) throw new AppError("Company not found", 404);
        companyId = company.id;
        companyName = company.name;
      } else {
        const company = await tx.company.create({
          data: {
            shopId,
            name: input.companyName!,
            industry: input.companyIndustry!,
            city: input.companyCity,
            source: DealSource.WEBSITE
          }
        });
        companyId = company.id;
        companyName = company.name;
      }

      // 2. Deal — defaults: title from part, value from target price × qty
      const deal = await tx.deal.create({
        data: {
          shopId,
          title: input.dealTitle ?? `${companyName} — ${input.partName}`,
          companyId,
          value: input.dealValue ?? (input.targetPrice ? input.targetPrice * input.qty : 0),
          stage: DealStage.NEW_RFQ,
          source: DealSource.WEBSITE
        }
      });

      // 3. RFQ
      const rfq = await tx.rfq.create({
        data: {
          shopId,
          dealId: deal.id,
          companyId,
          partName: input.partName,
          partNo: input.partNo,
          material: input.material,
          qty: input.qty,
          tolerance: input.tolerance,
          targetPrice: input.targetPrice,
          deadline: input.deadline,
          drawingNotes: input.drawingNotes,
          source: input.source
        }
      });

      await tx.activity.create({
        data: {
          shopId,
          dealId: deal.id,
          companyId,
          type: ActivityType.NOTE,
          description: `RFQ received: ${input.partName} (${input.partNo}) × ${input.qty} — ${input.material}`,
          metadata: { rfqId: rfq.id, partNo: input.partNo, qty: input.qty },
          actorId: actor.id
        }
      });

      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "rfq.created",
        entityType: "rfq",
        entityId: rfq.id,
        source: "api",
        afterData: { dealId: deal.id, companyId, partName: rfq.partName, partNo: rfq.partNo }
      });

      return { company: { id: companyId, name: companyName }, deal, rfq };
    });
  }

  async list(query: ListRfqsQueryDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const where = { shopId };
    const [total, rfqs] = await Promise.all([
      this.prisma.rfq.count({ where }),
      this.prisma.rfq.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true, stage: true, value: true } }
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      })
    ]);
    return { data: rfqs, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, shopId },
      include: { company: true, deal: { include: { quote: true } } }
    });
    if (!rfq) throw new AppError("RFQ not found", 404);
    return rfq;
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}
