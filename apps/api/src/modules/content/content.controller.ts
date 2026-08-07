import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { ContentService } from "./content.service";
import { contentAssetCreateSchema, contentGenerateSchema, contentRequestCreateSchema, contentRequestListQuerySchema, promoteSlowStockSchema, ContentAssetCreateDto, ContentGenerateDto, ContentRequestCreateDto, ContentRequestListQuery, PromoteSlowStockDto } from "./content.schemas";

@Controller("content")
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Post("studio/generate")
  generate(@Body(new ZodValidationPipe(contentGenerateSchema)) body: ContentGenerateDto, @CurrentUser() user: AuthUser) {
    return this.content.generateStudioAssets(user, body);
  }

  @Post("requests")
  createRequest(@Body(new ZodValidationPipe(contentRequestCreateSchema)) body: ContentRequestCreateDto, @CurrentUser() user: AuthUser) {
    return this.content.createRequest(user, body);
  }

  @Get("requests")
  listRequests(@Query(new ZodValidationPipe(contentRequestListQuerySchema)) query: ContentRequestListQuery, @CurrentUser() user: AuthUser) {
    return this.content.listRequests(user, query);
  }

  @Get("requests/:requestId")
  getRequest(@Param("requestId") requestId: string, @CurrentUser() user: AuthUser) {
    return this.content.getRequest(user, requestId);
  }

  @Post("requests/:requestId/assets")
  addAsset(@Param("requestId") requestId: string, @Body(new ZodValidationPipe(contentAssetCreateSchema)) body: ContentAssetCreateDto, @CurrentUser() user: AuthUser) {
    return this.content.addAsset(user, requestId, body);
  }

  @Post("requests/:requestId/generate")
  generateForRequest(@Param("requestId") requestId: string, @CurrentUser() user: AuthUser) {
    return this.content.generateForRequest(user, requestId);
  }

  @Post("assets/:assetId/approve")
  approveAsset(@Param("assetId") assetId: string, @Body() body: { note?: string }, @CurrentUser() user: AuthUser) {
    return this.content.reviewAsset(user, assetId, "approved", body?.note);
  }

  @Post("assets/:assetId/revise")
  reviseAsset(@Param("assetId") assetId: string, @Body() body: { note?: string }, @CurrentUser() user: AuthUser) {
    return this.content.reviewAsset(user, assetId, "revised", body?.note);
  }

  @Post("slow-stock/promote")
  promoteSlowStock(@Body(new ZodValidationPipe(promoteSlowStockSchema)) body: PromoteSlowStockDto, @CurrentUser() user: AuthUser) {
    return this.content.promoteSlowStock(user, body);
  }
}
