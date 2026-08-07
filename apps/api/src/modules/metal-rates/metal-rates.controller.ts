import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { MetalRatesService } from "./metal-rates.service";
import { metalRateCreateSchema, metalRateFetchSchema, MetalRateCreateDto, MetalRateFetchDto } from "./metal-rates.schemas";

@Controller("metal-rates")
@UseGuards(JwtAuthGuard)
export class MetalRatesController {
  constructor(private readonly metalRates: MetalRatesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(metalRateCreateSchema)) body: MetalRateCreateDto, @CurrentUser() user: AuthUser) {
    return this.metalRates.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.metalRates.list(user);
  }

  @Get("live")
  live(@CurrentUser() user: AuthUser) {
    return this.metalRates.liveRates(user);
  }

  @Get("board")
  board(@CurrentUser() user: AuthUser) {
    return this.metalRates.liveBoard(user);
  }

  @Post("gold/fetch")
  fetchGold(@Body(new ZodValidationPipe(metalRateFetchSchema)) body: MetalRateFetchDto, @CurrentUser() user: AuthUser) {
    return this.metalRates.fetchGold(user, body);
  }
}
