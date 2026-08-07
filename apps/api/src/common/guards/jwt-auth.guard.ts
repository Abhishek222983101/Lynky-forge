import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "@/common/database/prisma.service";
import { env } from "@/common/config/env";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing token");
    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), { secret: env.JWT_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user?.isActive) throw new UnauthorizedException("Inactive user");
      req.user = { id: user.id, shopId: user.shopId, role: user.role, isActive: user.isActive };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
