import { z } from "zod";

// A weight in grams. Coerced to a string (Prisma Decimal columns take strings),
// but must be a real non-negative number so a blank or non-numeric value fails
// here as a clean clarification instead of reaching - and crashing on - the DB.
const gramsField = z.coerce.string().refine((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0, {
  message: "Enter a weight in grams"
});

export const karigarCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const karigarJobCreateSchema = z.object({
  karigarId: z.string().uuid(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  itemDescription: z.string().min(1),
  purity: z.string().min(1),
  issuedWeight: gramsField.refine((value) => Number(value) > 0, { message: "Weight must be greater than zero" }),
  issuedDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional().nullable()
});

export const karigarReturnCreateSchema = z.object({
  finishedWeight: gramsField,
  scrapWeight: gramsField.default("0"),
  returnDate: z.coerce.date().optional(),
  notes: z.string().optional().nullable()
});

export type KarigarCreateDto = z.infer<typeof karigarCreateSchema>;
export type KarigarJobCreateDto = z.infer<typeof karigarJobCreateSchema>;
export type KarigarReturnCreateDto = z.infer<typeof karigarReturnCreateSchema>;
