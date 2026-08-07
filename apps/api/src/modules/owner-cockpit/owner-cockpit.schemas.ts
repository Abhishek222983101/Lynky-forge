import { z } from "zod";

export const ownerCockpitQuerySchema = z.object({
  question: z.string().min(1),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  customerId: z.string().uuid().optional()
});

export type OwnerCockpitQueryDto = z.infer<typeof ownerCockpitQuerySchema>;
