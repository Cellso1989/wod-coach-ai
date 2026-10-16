import { describe, it, expect } from 'vitest';
import { athleteProfileSchema } from '@wod-coach-ai/validation';

describe('athleteProfileSchema', () => {
  it('accepts a minimal payload and defaults array fields to empty', () => {
    const result = athleteProfileSchema.parse({});

    expect(result.goals).toEqual([]);
    expect(result.injuries).toEqual([]);
    expect(result.limitedMovements).toEqual([]);
    expect(result.equipment).toEqual([]);
    expect(result.rankingOptIn).toBeUndefined();
  });

  it('accepts a fully filled profile', () => {
    const result = athleteProfileSchema.parse({
      birthDate: '1995-05-20',
      heightCm: 178,
      weightKg: 82.5,
      sex: 'MALE',
      level: 'INTERMEDIATE',
      weeklyFrequency: 5,
      goals: ['performance', 'competicao'],
      injuries: ['ombro direito'],
      limitedMovements: ['overhead squat'],
      equipment: ['barra', 'kettlebell'],
    });

    expect(result.heightCm).toBe(178);
    expect(result.level).toBe('INTERMEDIATE');
  });

  it('rejects an out-of-range height', () => {
    const result = athleteProfileSchema.safeParse({ heightCm: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid sex enum value', () => {
    const result = athleteProfileSchema.safeParse({ sex: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it.each([true, false])('accepts explicit ranking participation %s', (rankingOptIn) => {
    expect(athleteProfileSchema.parse({ rankingOptIn }).rankingOptIn).toBe(rankingOptIn);
  });

  it.each(['true', 'false', 0, 1, null])('rejects invalid participation %s', (rankingOptIn) => {
    expect(athleteProfileSchema.safeParse({ rankingOptIn }).success).toBe(false);
  });
});
