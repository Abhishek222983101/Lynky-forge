import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { AuditBooksService } from "./audit-books.service";
import { auditBookListQuerySchema, auditBookUpsertSchema, AuditBookListQuery, AuditBookUpsertDto } from "./audit-books.schemas";

@Controller("audit-books")
@UseGuards(JwtAuthGuard)
export class AuditBooksController {
  constructor(private readonly auditBooks: AuditBooksService) {}

  @Get()
  list(@Query(new ZodValidationPipe(auditBookListQuerySchema)) query: AuditBookListQuery, @CurrentUser() user: AuthUser) {
    return this.auditBooks.list(user, query);
  }

  @Put("entries")
  upsert(@Body(new ZodValidationPipe(auditBookUpsertSchema)) body: AuditBookUpsertDto, @CurrentUser() user: AuthUser) {
    return this.auditBooks.upsert(user, body);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.auditBooks.summary(user);
  }
}
