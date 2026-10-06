import { describe, it, expect } from 'vitest';
import { personalRecordSchema } from '@wod-coach-ai/validation';

describe('personalRecordSchema', () => {
  it.each([
    { recordType: 'ONE_RM', unit: 'kg' },
    { recordType: 'REP_MAX', unit: 'lb', repetitions: 5 },
    { recordType: 'UNBROKEN_REPS', unit: 'reps' },
    { recordType: 'TIME', unit: 'sec' },
    { recordType: 'UNKNOWN', unit: 'custom' },
  ])('accepts explicitly classified PR: %j', (fields) => {
    expect(
      personalRecordSchema.safeParse({ movementName: 'Test', value: 100, ...fields }).success,
    ).toBe(true);
  });
  it.each([
    { recordType: 'ONE_RM', unit: 'reps' },
    { recordType: 'ONE_RM', unit: 'kg', repetitions: 5 },
    { recordType: 'REP_MAX', unit: 'kg' },
    { recordType: 'REP_MAX', unit: 'kg', repetitions: 1 },
    { recordType: 'REP_MAX', unit: 'kg', repetitions: 2.5 },
    { recordType: 'UNBROKEN_REPS', unit: 'kg' },
    { recordType: 'UNBROKEN_REPS', unit: 'reps', value: 2.5 },
    { recordType: 'TIME', unit: 'kg' },
    { recordType: 'UNKNOWN', unit: 'kg', repetitions: 5 },
    { recordType: 'ESTIMATED_1RM', unit: 'kg' },
  ])('rejects inconsistent classification: %j', (fields) => {
    expect(
      personalRecordSchema.safeParse({ movementName: 'Test', value: 100, ...fields }).success,
    ).toBe(false);
  });
  it('accepts a lift PR', () => {
    const result = personalRecordSchema.safeParse({
      movementName: 'Back Squat',
      value: 140,
      unit: 'kg',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a benchmark WOD PR (time-based)', () => {
    const result = personalRecordSchema.safeParse({
      movementName: 'Fran',
      value: 192,
      unit: 'sec',
      notes: 'Rx',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive value', () => {
    const result = personalRecordSchema.safeParse({
      movementName: 'Deadlift',
      value: 0,
      unit: 'kg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty movement name', () => {
    const result = personalRecordSchema.safeParse({ movementName: '', value: 100, unit: 'kg' });
    expect(result.success).toBe(false);
  });
});
