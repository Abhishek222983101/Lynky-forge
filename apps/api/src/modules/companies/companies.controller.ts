import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import {
  CreateCompanyDto,
  CreateContactDto,
  ListCompaniesQueryDto,
  UpdateCompanyDto,
  createCompanySchema,
  createContactSchema,
  listCompaniesQuerySchema,
  updateCompanySchema
} from "./companies.schemas";
import { CompaniesService } from "./companies.service";

@Controller("companies")
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyDto, @CurrentUser() user: AuthUser) {
    return this.companies.create(body, user);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listCompaniesQuerySchema)) query: ListCompaniesQueryDto, @CurrentUser() user: AuthUser) {
    return this.companies.list(query, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Query("include") include: string | undefined, @CurrentUser() user: AuthUser) {
    return this.companies.findOne(id, include, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.companies.update(id, body, user);
  }

  @Post(":id/contacts")
  addContact(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.companies.addContact(id, body, user);
  }

  @Get(":id/contacts")
  listContacts(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.companies.listContacts(id, user);
  }
}
