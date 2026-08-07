import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { listSalesQuerySchema, ListSalesQuery, manualSaleSchema, ManualSaleDto } from "./sales.schemas";
import { SalesService } from "./sales.service";

@Controller("sales")
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post("manual")
  createManual(@Body(new ZodValidationPipe(manualSaleSchema)) body: ManualSaleDto, @CurrentUser() user: AuthUser) {
    return this.sales.createManual(body, user);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listSalesQuerySchema)) query: ListSalesQuery, @CurrentUser() user: AuthUser) {
    return this.sales.list(user, query);
  }

  @Get("summary/today")
  today(@CurrentUser() user: AuthUser) {
    if (!user.shopId) return { detail: "Shop context required" };
    return this.sales.todaySummary(user.shopId);
  }

  @Get(":saleId")
  detail(@Param("saleId") saleId: string, @CurrentUser() user: AuthUser) {
    return this.sales.findById(user, saleId);
  }
}
