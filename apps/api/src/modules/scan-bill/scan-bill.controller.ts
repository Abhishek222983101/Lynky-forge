import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { ScanBillService } from "./scan-bill.service";
import { scanBillConfirmSchema, scanBillCreateSchema, ScanBillConfirmDto, ScanBillCreateDto } from "./scan-bill.schemas";

@Controller("scan-bill")
@UseGuards(JwtAuthGuard)
export class ScanBillController {
  constructor(private readonly scanBill: ScanBillService) {}

  @Post("jobs")
  create(@Body(new ZodValidationPipe(scanBillCreateSchema)) body: ScanBillCreateDto, @CurrentUser() user: AuthUser) {
    return this.scanBill.create(user, body);
  }

  @Get("jobs")
  list(@CurrentUser() user: AuthUser) {
    return this.scanBill.list(user);
  }

  @Post("jobs/:jobId/confirm")
  confirm(@Param("jobId") jobId: string, @Body(new ZodValidationPipe(scanBillConfirmSchema)) body: ScanBillConfirmDto, @CurrentUser() user: AuthUser) {
    return this.scanBill.confirm(user, jobId, body);
  }
}
