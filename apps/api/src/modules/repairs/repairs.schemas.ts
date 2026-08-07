import { RepairOrderStatus } from "@prisma/client";
import { z } from "zod";

export const repairCreateSchema = z.object({
  customerId: z.string().uuid(),
  itemDescription: z.string().min(1),
  purity: z.string().optional().nullable(),
  expectedDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const repairStatusUpdateSchema = z.object({
  status: z.nativeEnum(RepairOrderStatus),
  notes: z.string().optional().nullable()
});

export const repairListQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(RepairOrderStatus).optional()
});

export type RepairCreateDto = z.infer<typeof repairCreateSchema>;
export type RepairStatusUpdateDto = z.infer<typeof repairStatusUpdateSchema>;
export type RepairListQuery = z.infer<typeof repairListQuerySchema>;
