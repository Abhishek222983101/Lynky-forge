import { StorageMode } from "@prisma/client";
import { z } from "zod";

export const createShopSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  gstNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  defaultLanguage: z.string().default("ta-IN"),
  storageMode: z.nativeEnum(StorageMode).default(StorageMode.shared_cloud),
  currency: z.string().default("INR"),
  timezone: z.string().default("Asia/Kolkata")
});

export type CreateShopDto = z.infer<typeof createShopSchema>;
