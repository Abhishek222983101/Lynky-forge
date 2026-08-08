import { TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";

export const createTaskSchema = z.object({
  type: z.nativeEnum(TaskType),
  dueAt: z.coerce.date(),
  dealId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  message: z.string().max(500).optional()
});

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus)
});

export const listTasksQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  dealId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  overdue: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusDto = z.infer<typeof updateTaskStatusSchema>;
export type ListTasksQueryDto = z.infer<typeof listTasksQuerySchema>;
