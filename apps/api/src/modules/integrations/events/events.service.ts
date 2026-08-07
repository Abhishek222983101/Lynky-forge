import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";

type Db = PrismaService | Prisma.TransactionClient | PrismaClient;

@Injectable()
export class EventsService {
  publish(db: Db, shopId: string, eventName: string, payload: Prisma.InputJsonValue) {
    return db.internalEvent.create({ data: { shopId, eventName, payload } });
  }
}
