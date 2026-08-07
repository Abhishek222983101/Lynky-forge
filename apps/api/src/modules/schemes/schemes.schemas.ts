import { PaymentMethod, SavingsSchemeStatus } from "@prisma/client";
import { z } from "zod";

export const schemeCreateSchema = z.object({
  customerId: z.string().uuid(),
  monthlyAmount: z.coerce.string(),
  months: z.coerce.number().int().positive(),
  startDate: z.coerce.date(),
  maturityDate: z.coerce.date().optional(),
  notes: z.string().optional().nullable()
});

export const schemeInstallmentSchema = z.object({
  amount: z.coerce.string(),
  paidAt: z.coerce.date().default(() => new Date()),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.cash),
  referenceNumber: z.string().optional().nullable()
});

export const schemeListQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(SavingsSchemeStatus).optional()
});

export const schemeStatusSchema = z.object({
  status: z.nativeEnum(SavingsSchemeStatus)
});

export type SchemeCreateDto = z.infer<typeof schemeCreateSchema>;
export type SchemeInstallmentDto = z.infer<typeof schemeInstallmentSchema>;
export type SchemeListQuery = z.infer<typeof schemeListQuerySchema>;
export type SchemeStatusDto = z.infer<typeof schemeStatusSchema>;
