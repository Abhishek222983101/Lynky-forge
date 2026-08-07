import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { createUserSchema, CreateUserDto } from "./users.schemas";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(body, user);
  }
}
