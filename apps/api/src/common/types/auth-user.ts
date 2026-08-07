import { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  shopId: string | null;
  role: UserRole;
  isActive: boolean;
};
