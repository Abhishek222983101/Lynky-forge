import { Body, Controller, Post } from "@nestjs/common";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { loginSchema, LoginDto } from "./auth.schemas";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginDto) {
    return this.auth.login(body);
  }
}
