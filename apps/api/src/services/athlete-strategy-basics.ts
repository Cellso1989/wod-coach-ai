import { prisma } from '@wod-coach-ai/database';
import { z } from 'zod';
import { withoutDatabaseTiming, type MeasureWodDatabase } from './wod-database-timing.js';

const basicsSchema = z.object({
  profile: z
    .object({
      level: z.enum(['SCALED', 'INTERMEDIATE', 'RX', 'ELITE']).nullable(),
      goals: z.array(z.string()),
      injuries: z.array(z.string()),
      limitedMovements: z.array(z.string()),
      weeklyFrequency: z.number().nullable(),
    })
    .nullable(),
  checkins: z.array(z.object({ date: z.coerce.date() })),
  personalRecords: z.array(
    z.object({
      movementName: z.string(),
      value: z.number(),
      unit: z.string(),
      recordType: z.enum(['UNKNOWN', 'ONE_RM', 'REP_MAX', 'UNBROKEN_REPS', 'TIME']),
      repetitions: z.number().nullable(),
      achievedAt: z.coerce.date(),
    }),
  ),
});
export type AthleteStrategyBasics = z.infer<typeof basicsSchema>;

/** One account-scoped round trip, without photos, notes or unrelated profile fields. */
export async function readAthleteStrategyBasics(
  userId: string,
  measure: MeasureWodDatabase = withoutDatabaseTiming,
): Promise<AthleteStrategyBasics> {
  const cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const rows = await measure(
    'context.basics',
    () => prisma.$queryRaw<unknown[]>`
    SELECT
      (SELECT jsonb_build_object(
        'level', "level", 'goals', COALESCE("goals", ARRAY[]::text[]),
        'injuries', COALESCE("injuries", ARRAY[]::text[]),
        'limitedMovements', COALESCE("limitedMovements", ARRAY[]::text[]),
        'weeklyFrequency', "weeklyFrequency")
       FROM "athlete_profiles" WHERE "userId" = ${userId}) AS "profile",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('date', "date" AT TIME ZONE 'UTC') ORDER BY "date" DESC)
        FROM "daily_checkins" WHERE "userId" = ${userId} AND "date" >= ${cutoff}), '[]'::jsonb) AS "checkins",
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'movementName', "movementName", 'value', "value", 'unit', "unit",
        'recordType', "recordType", 'repetitions', "repetitions", 'achievedAt', "achievedAt" AT TIME ZONE 'UTC'))
        FROM "personal_records" WHERE "userId" = ${userId}), '[]'::jsonb) AS "personalRecords"
  `,
  );
  return basicsSchema.parse(rows[0]);
}
