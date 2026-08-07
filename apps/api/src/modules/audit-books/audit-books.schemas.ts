import { AuditBookStatus } from "@prisma/client";
import { z } from "zod";

export const auditBookListQuerySchema = z.object({
  status: z.nativeEnum(AuditBookStatus).optional()
});

export const auditBookUpsertSchema = z.object({
  saleId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(AuditBookStatus),
  notes: z.string().optional().nullable()
});

export type AuditBookListQuery = z.infer<typeof auditBookListQuerySchema>;
export type AuditBookUpsertDto = z.infer<typeof auditBookUpsertSchema>;
