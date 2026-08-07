import { MakingChargeType, PaymentMethod, PaymentStatus } from "@prisma/client";
import { z } from "zod";

export const saleCustomerSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  preferredLanguage: z.string().optional()
}).optional();

export const saleItemSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  itemName: z.string().min(1),
  purity: z.string().min(1),
  grossWeight: z.coerce.string(),
  netWeight: z.coerce.string(),
  goldRatePerGram: z.coerce.string(),
  makingChargeType: z.nativeEnum(MakingChargeType),
  makingChargeValue: z.coerce.string(),
  hallmarkingChargeAmount: z.coerce.string().default("0"),
  huidNumber: z.string().optional().nullable()
});

export const manualSaleSchema = z.object({
  customer: saleCustomerSchema,
  saleDate: z.coerce.date().optional(),
  items: z.array(saleItemSchema).min(1),
  amountPaid: z.coerce.string().default("0"),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.cash),
  referenceNumber: z.string().optional(),
  notes: z.string().optional()
});

export const listSalesQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  customerId: z.string().uuid().optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional()
});

export type ManualSaleDto = z.infer<typeof manualSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
