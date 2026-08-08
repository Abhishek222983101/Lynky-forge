import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskStatusDto,
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskStatusSchema
} from "./tasks.schemas";
import { TasksService } from "./tasks.service";

@Controller("tasks")
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasks.create(body, user);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQueryDto, @CurrentUser() user: AuthUser) {
    return this.tasks.list(query, user);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaskStatusSchema)) body: UpdateTaskStatusDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.tasks.updateStatus(id, body, user);
  }
}
