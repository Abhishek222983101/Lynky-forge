import { z } from "zod";

export const askQuerySchema = z.object({
  question: z.string().min(1).max(500),
});

export type AskQueryDto = z.infer<typeof askQuerySchema>;
