import { AccessSection } from "@prisma/client";
import { z } from "zod";

export const accessUpsertSchema = z.object({
  userId: z.string().uuid(),
  section: z.nativeEnum(AccessSection),
  canAccess: z.coerce.boolean()
});

export type AccessUpsertDto = z.infer<typeof accessUpsertSchema>;
