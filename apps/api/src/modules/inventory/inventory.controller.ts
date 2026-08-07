import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { InventoryService } from "./inventory.service";
import { inventoryItemCreateSchema, inventoryListQuerySchema, inventoryStatusUpdateSchema, slowStockQuerySchema, stockMovementCreateSchema, InventoryItemCreateDto, InventoryListQuery, InventoryStatusUpdateDto, SlowStockQuery, StockMovementCreateDto } from "./inventory.schemas";

@Controller("inventory")
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post("items")
  createItem(@Body(new ZodValidationPipe(inventoryItemCreateSchema)) body: InventoryItemCreateDto, @CurrentUser() user: AuthUser) {
    return this.inventory.createItem(user, body);
  }

  @Get("items")
  listItems(@Query(new ZodValidationPipe(inventoryListQuerySchema)) query: InventoryListQuery, @CurrentUser() user: AuthUser) {
    return this.inventory.listItems(user, query);
  }

  @Get("items/:itemId")
  getItem(@Param("itemId") itemId: string, @CurrentUser() user: AuthUser) {
    return this.inventory.getItem(user, itemId);
  }

  @Patch("items/:itemId/status")
  updateStatus(@Param("itemId") itemId: string, @Body(new ZodValidationPipe(inventoryStatusUpdateSchema)) body: InventoryStatusUpdateDto, @CurrentUser() user: AuthUser) {
    return this.inventory.updateStatus(user, itemId, body);
  }

  @Post("movements")
  recordMovement(@Body(new ZodValidationPipe(stockMovementCreateSchema)) body: StockMovementCreateDto, @CurrentUser() user: AuthUser) {
    return this.inventory.recordMovement(user, body);
  }

  @Get("movements")
  listMovements(@Query("inventoryItemId") inventoryItemId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.inventory.listMovements(user, inventoryItemId);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.inventory.summary(user);
  }

  @Get("slow-stock")
  slowStock(@Query(new ZodValidationPipe(slowStockQuerySchema)) query: SlowStockQuery, @CurrentUser() user: AuthUser) {
    return this.inventory.slowStock(user, query);
  }
}
