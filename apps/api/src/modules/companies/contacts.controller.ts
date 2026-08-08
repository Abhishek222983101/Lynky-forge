import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { CompaniesService } from "./companies.service";
import { UpdateContactDto, updateContactSchema } from "./companies.schemas";

@Controller("contacts")
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly companies: CompaniesService) {}

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.companies.updateContact(id, body, user);
  }
}
