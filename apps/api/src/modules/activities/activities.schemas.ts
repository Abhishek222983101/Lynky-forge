import { ActivityType } from "@prisma/client";
import { z } from "zod";

export const createActivitySchema = z.object({
  type: z.nativeEnum(ActivityType).default(ActivityType.NOTE),
  description: z.string().min(1).max(1000),
  metadata: z.record(z.unknown()).optional()
});

export type CreateActivityDto = z.infer<typeof createActivitySchema>;
