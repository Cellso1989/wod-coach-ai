import { describe, expect, it } from 'vitest';
import { parseWorkoutTime } from '../../apps/web/src/lib/workout-time.js';
import { dailyCheckinSchema } from '@wod-coach-ai/validation';

describe('workout result time', () => {
  it.each([
    ['', undefined],
    ['  ', undefined],
    ['0', 0],
    ['0:00', 0],
    ['0:59', 59],
    ['1:00', 60],
    ['12:34', 754],
    [' 12:34 ', 754],
    ['754', 754],
    ['2147483647', 2147483647],
    ['35791394:07', 2147483647],
  ] as const)('parses %s without rounding or changing the result', (value, expected) => {
    expect(parseWorkoutTime(value)).toBe(expected);
  });
  it.each([
    '12:99',
    '0:60',
    '12:34:56',
    '12:',
    ':34',
    '-1',
    '-1:20',
    '1.5',
    '1:2',
    '1:2.5',
    'abc',
    'Infinity',
    '1e3',
    '1 :20',
    '2147483648',
    '35791394:08',
    '999999999999999999999:00',
  ])('rejects invalid time %s instead of silently saving it', (value) => {
    expect(parseWorkoutTime(value)).toBeNull();
  });
  it.each([-1, 1.5, 2147483648])('API rejects an invalid integer result %s', (timeSeconds) => {
    expect(dailyCheckinSchema.safeParse({ timeSeconds }).success).toBe(false);
  });
  it('keeps an empty optional result valid', () => {
    expect(dailyCheckinSchema.safeParse({}).success).toBe(true);
  });
});
