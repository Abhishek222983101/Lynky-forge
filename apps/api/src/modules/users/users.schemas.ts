import { UserRole } from "@prisma/client";
import { z } from "zod";

export const createUserSchema = z.object({
  shopId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole)
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
