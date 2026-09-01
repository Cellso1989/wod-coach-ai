import { z } from "zod";

export const personalRecordSchema = z.object({
  movementName: z.string().trim().min(1).max(80),
  value: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(20),
  achievedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
});

export type PersonalRecordInput = z.infer<typeof personalRecordSchema>;
