import { describe, expect, it } from 'vitest';
import { formatStrategyRoundLabels } from '../../apps/web/src/lib/strategy-round-labels.js';

describe('strategy round labels', () => {
  it('clarifies the saved break recommendation without changing sets', () => {
    expect(formatStrategyRoundLabels('R1-2: 6/6; R3-4: 5/5/2; R5: 4/4/4 se fadiga.')).toBe(
      'Rounds 1 e 2: 6/6; Rounds 3 e 4: 5/5/2; Round 5: 4/4/4 se fadiga.',
    );
  });

  it.each(['R1-3', 'Rounds 1-3', 'Rounds 1\u20133', 'R1\u2014R3'])(
    'lists every round in %s',
    (label) => {
      expect(formatStrategyRoundLabels(label)).toBe('Rounds 1, 2 e 3');
    },
  );

  it('preserves ladders, breaks, loads and time ranges', () => {
    const text = 'Thrusters (21-15-9 por round): 6/6; 8-12s; 40-50kg; 12:00-15:00.';
    expect(formatStrategyRoundLabels(text)).toBe(text);
  });

  it('does not change explicitly listed or invalid ranges', () => {
    const text = 'Rounds 1 e 3: direto; R4-2; R0-3; R1-101.';
    expect(formatStrategyRoundLabels(text)).toBe(text);
  });

  it('is idempotent', () => {
    const formatted = formatStrategyRoundLabels('R1-2: 6/6; R3: direto.');
    expect(formatStrategyRoundLabels(formatted)).toBe(formatted);
  });
});
