import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { BuybackService } from "./buyback.service";
import { assignItemsSchema, buybackBundleCreateSchema, buybackItemCreateSchema, buybackListQuerySchema, AssignItemsDto, BuybackBundleCreateDto, BuybackItemCreateDto, BuybackListQuery } from "./buyback.schemas";

@Controller("buyback")
@UseGuards(JwtAuthGuard)
export class BuybackController {
  constructor(private readonly buyback: BuybackService) {}

  @Post("items")
  recordItem(@Body(new ZodValidationPipe(buybackItemCreateSchema)) body: BuybackItemCreateDto, @CurrentUser() user: AuthUser) {
    return this.buyback.recordItem(user, body);
  }

  @Get("items")
  listItems(@Query(new ZodValidationPipe(buybackListQuerySchema)) query: BuybackListQuery, @CurrentUser() user: AuthUser) {
    return this.buyback.listItems(user, query);
  }

  @Post("bundles")
  createBundle(@Body(new ZodValidationPipe(buybackBundleCreateSchema)) body: BuybackBundleCreateDto, @CurrentUser() user: AuthUser) {
    return this.buyback.createBundle(user, body);
  }

  @Get("bundles")
  listBundles(@CurrentUser() user: AuthUser) {
    return this.buyback.listBundles(user);
  }

  @Post("bundles/:bundleId/items")
  assignItems(@Param("bundleId") bundleId: string, @Body(new ZodValidationPipe(assignItemsSchema)) body: AssignItemsDto, @CurrentUser() user: AuthUser) {
    return this.buyback.assignItems(user, bundleId, body);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.buyback.summary(user);
  }
}
