import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { CustomersService } from "./customers.service";
import {
  customerCreateSchema,
  customerImportSchema,
  customerListQuerySchema,
  customerUpdateSchema,
  distributorOrderCreateSchema,
  followUpCreateSchema,
  followUpListQuerySchema,
  followUpStatusSchema,
  CustomerCreateDto,
  CustomerImportDto,
  CustomerListQuery,
  CustomerUpdateDto,
  DistributorOrderCreateDto,
  FollowUpCreateDto,
  FollowUpListQuery,
  FollowUpStatusDto
} from "./customers.schemas";

@Controller("customers")
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Body(new ZodValidationPipe(customerCreateSchema)) body: CustomerCreateDto, @CurrentUser() user: AuthUser) {
    return this.customers.create(user, body);
  }

  @Get()
  list(@Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery, @CurrentUser() user: AuthUser) {
    return this.customers.list(user, query);
  }

  @Post("import")
  importCustomers(@Body(new ZodValidationPipe(customerImportSchema)) body: CustomerImportDto, @CurrentUser() user: AuthUser) {
    return this.customers.importCustomers(user, body);
  }

  @Get("export")
  @Header("Cache-Control", "private, max-age=0, no-cache")
  async exportCustomers(@Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.customers.exportCustomers(user, query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"customers.csv\"");
    res.send(csv);
  }

  @Post("follow-ups")
  createFollowUp(@Body(new ZodValidationPipe(followUpCreateSchema)) body: FollowUpCreateDto, @CurrentUser() user: AuthUser) {
    return this.customers.createFollowUp(user, body);
  }

  @Get("follow-ups/list")
  listFollowUps(@Query(new ZodValidationPipe(followUpListQuerySchema)) query: FollowUpListQuery, @CurrentUser() user: AuthUser) {
    return this.customers.listFollowUps(user, query);
  }

  @Patch("follow-ups/:followUpId/status")
  updateFollowUpStatus(@Param("followUpId") followUpId: string, @Body(new ZodValidationPipe(followUpStatusSchema)) body: FollowUpStatusDto, @CurrentUser() user: AuthUser) {
    return this.customers.updateFollowUpStatus(user, followUpId, body);
  }

  @Post("wholesale/orders")
  createDistributorOrder(@Body(new ZodValidationPipe(distributorOrderCreateSchema)) body: DistributorOrderCreateDto, @CurrentUser() user: AuthUser) {
    return this.customers.createDistributorOrder(user, body);
  }

  @Get("wholesale/orders")
  listDistributorOrders(@Query("customerId") customerId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.customers.listDistributorOrders(user, customerId);
  }

  @Get(":customerId")
  get(@Param("customerId") customerId: string, @CurrentUser() user: AuthUser) {
    return this.customers.get(user, customerId);
  }

  @Patch(":customerId")
  update(@Param("customerId") customerId: string, @Body(new ZodValidationPipe(customerUpdateSchema)) body: CustomerUpdateDto, @CurrentUser() user: AuthUser) {
    return this.customers.update(user, customerId, body);
  }

  @Get(":customerId/summary")
  summary(@Param("customerId") customerId: string, @CurrentUser() user: AuthUser) {
    return this.customers.summary(user, customerId);
  }
}
