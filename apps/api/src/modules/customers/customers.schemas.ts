import { CustomerType, FollowUpStatus, FollowUpType, PaymentStatus } from "@prisma/client";
import { z } from "zod";

const jsonRecord = z.record(z.unknown());

export const customerCreateSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  customerType: z.nativeEnum(CustomerType).default(CustomerType.retail),
  companyName: z.string().optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
  birthday: z.coerce.date().optional().nullable(),
  anniversaryDate: z.coerce.date().optional().nullable(),
  tags: z.array(z.string()).optional(),
  preferences: jsonRecord.optional(),
  messageOptIn: z.coerce.boolean().default(false),
  notes: z.string().optional().nullable()
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerListQuerySchema = z.object({
  customerType: z.nativeEnum(CustomerType).optional(),
  q: z.string().optional()
});

export const customerImportSchema = z.object({
  rows: z.array(customerCreateSchema.extend({
    externalReference: z.string().optional().nullable()
  })).min(1).max(1000)
});

export const followUpCreateSchema = z.object({
  customerId: z.string().uuid(),
  type: z.nativeEnum(FollowUpType),
  dueAt: z.coerce.date(),
  message: z.string().optional().nullable(),
  metadata: jsonRecord.optional()
});

export const followUpListQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(FollowUpStatus).optional()
});

export const followUpStatusSchema = z.object({
  status: z.nativeEnum(FollowUpStatus)
});

export const distributorOrderCreateSchema = z.object({
  customerId: z.string().uuid(),
  metal: z.string().min(1),
  ornamentType: z.string().min(1),
  quantityWeight: z.coerce.string(),
  orderValue: z.coerce.string(),
  paymentStatus: z.nativeEnum(PaymentStatus).default(PaymentStatus.pending),
  notes: z.string().optional().nullable()
});

export type CustomerCreateDto = z.infer<typeof customerCreateSchema>;
export type CustomerImportDto = z.infer<typeof customerImportSchema>;
export type CustomerUpdateDto = z.infer<typeof customerUpdateSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type FollowUpCreateDto = z.infer<typeof followUpCreateSchema>;
export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
export type FollowUpStatusDto = z.infer<typeof followUpStatusSchema>;
export type DistributorOrderCreateDto = z.infer<typeof distributorOrderCreateSchema>;
