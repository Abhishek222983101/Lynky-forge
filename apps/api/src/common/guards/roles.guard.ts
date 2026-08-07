import { CanActivate, ExecutionContext, Injectable, mixin, Type } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AppError } from "@/common/errors/app-error";

export function RolesGuard(...roles: UserRole[]): Type<CanActivate> {
  @Injectable()
  class Guard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const user = context.switchToHttp().getRequest().user;
      if (!user || !roles.includes(user.role)) throw new AppError("Insufficient permissions", 403);
      return true;
    }
  }
  return mixin(Guard);
}
