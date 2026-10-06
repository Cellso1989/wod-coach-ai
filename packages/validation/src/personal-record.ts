import { z } from 'zod';
import { PERSONAL_RECORD_TYPES } from '@wod-coach-ai/types';

export const personalRecordSchema = z
  .object({
    movementName: z.string().trim().min(1).max(80),
    value: z.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(20),
    recordType: z.enum(PERSONAL_RECORD_TYPES).optional(),
    repetitions: z.number().int().min(2).max(10_000).nullable().optional(),
    achievedAt: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((record, ctx) => {
    const type = record.recordType ?? 'UNKNOWN';
    const unit = record.unit.toLowerCase();
    if ((type === 'ONE_RM' || type === 'REP_MAX') && !/^(?:kgs?|lbs?)$/.test(unit)) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'PR de carga exige kg ou lb.' });
    }
    if (type === 'UNBROKEN_REPS' && (unit !== 'reps' || !Number.isInteger(record.value))) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Repeticoes sem quebra exigem valor inteiro e unidade reps.',
      });
    }
    if (type === 'TIME' && unit !== 'sec') {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'PR de tempo exige segundos.' });
    }
    if (type === 'REP_MAX' ? record.repetitions == null : record.repetitions != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['repetitions'],
        message: 'Informe repeticoes somente para carga em varias repeticoes.',
      });
    }
  });

export type PersonalRecordInput = z.infer<typeof personalRecordSchema>;
