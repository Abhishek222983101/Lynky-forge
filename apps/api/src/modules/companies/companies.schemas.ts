import { DealSource, Industry } from "@prisma/client";
import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.nativeEnum(Industry),
  city: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  website: z.string().max(200).optional(),
  annualPotential: z.number().nonnegative().optional(),
  source: z.nativeEnum(DealSource).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(2000).optional()
});

export const updateCompanySchema = createCompanySchema.partial();

export const listCompaniesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  industry: z.nativeEnum(Industry).optional()
});

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  isPrimary: z.boolean().default(false)
});

export const updateContactSchema = createContactSchema.partial();

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;
export type ListCompaniesQueryDto = z.infer<typeof listCompaniesQuerySchema>;
export type CreateContactDto = z.infer<typeof createContactSchema>;
export type UpdateContactDto = z.infer<typeof updateContactSchema>;
