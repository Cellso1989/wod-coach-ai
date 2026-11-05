import { describe, expect, it } from 'vitest';
import { getWodResultFeedback } from '../../apps/web/src/lib/wod-result-feedback.js';

const timedWorkout = { format: 'FOR_TIME' as const, durationMinutes: 14 };

describe('result feedback', () => {
  it.each(['CAP 10', 'cap 25', ' CAP20 ', 'CaP 12 + 5 reps', 'CAP', 'Cap +1', 'CAP+1', 'CAP ＋１'])(
    'treats %s as an unfinished workout',
    (score) => expect(getWodResultFeedback(score, timedWorkout)).toBe('Hoje não rendeu, hein! 😂'),
  );

  it.each(['12:34', '14:00', '11:19 min', '14 min', '13,5 minutos'])(
    'accepts %s within the time cap',
    (score) =>
      expect(getWodResultFeedback(score, timedWorkout)).toBe(
        'Boa, meu atleta! Mais um WOD pra conta! 🔥💪😂',
      ),
  );

  it.each(['14:01', '15 min', '14,5 minutos'])(
    'treats %s above the time cap as unfinished',
    (score) => expect(getWodResultFeedback(score, timedWorkout)).toBe('Hoje não rendeu, hein! 😂'),
  );

  it.each(['AMRAP', 'EMOM', 'STRENGTH', 'INTERVAL'] as const)(
    'does not treat the duration of %s as a completion deadline',
    (format) => {
      expect(getWodResultFeedback('20:00', { ...timedWorkout, format })).toBe(
        'Boa, meu atleta! Mais um WOD pra conta! 🔥💪😂',
      );
    },
  );

  it.each(['3round + 12', '3 rounds + 12 reps', '150 repetições'])(
    'accepts AMRAP completed work %s without treating the partial final round as CAP',
    (score) =>
      expect(getWodResultFeedback(score, { format: 'AMRAP', durationMinutes: 15 })).toBe(
        'Boa, meu atleta! Mais um WOD pra conta! 🔥💪😂',
      ),
  );

  it('supports results without a prescribed time or analysis', () => {
    expect(getWodResultFeedback('8 rounds + 12 reps')).toBe(
      'Boa, meu atleta! Mais um WOD pra conta! 🔥💪😂',
    );
    expect(getWodResultFeedback('12:34', { ...timedWorkout, durationMinutes: null })).toBe(
      'Boa, meu atleta! Mais um WOD pra conta! 🔥💪😂',
    );
    expect(getWodResultFeedback('CAP 10')).toBe('Hoje não rendeu, hein! 😂');
  });
});
