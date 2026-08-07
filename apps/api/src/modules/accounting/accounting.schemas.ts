import { AccountingExportType, AccountingProvider } from "@prisma/client";
import { z } from "zod";

export const accountingExportCreateSchema = z.object({
  provider: z.nativeEnum(AccountingProvider),
  exportType: z.nativeEnum(AccountingExportType),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  tallyCompanyName: z.string().optional(),
  tallyEndpointUrl: z.string().url().optional(),
  pushToTally: z.coerce.boolean().default(false),
  zohoOrganizationId: z.string().optional(),
  zohoAccessToken: z.string().optional(),
  zohoApiDomain: z.string().url().optional(),
  pushToZoho: z.coerce.boolean().default(false)
});

export const accountingExportListQuerySchema = z.object({
  provider: z.nativeEnum(AccountingProvider).optional(),
  exportType: z.nativeEnum(AccountingExportType).optional()
});

export type AccountingExportCreateDto = z.infer<typeof accountingExportCreateSchema>;
export type AccountingExportListQuery = z.infer<typeof accountingExportListQuerySchema>;
