import { describe, expect, it } from 'vitest';
import { applyLoadOverrides, reconcileLoadWarnings } from '@wod-coach-ai/coach-engine';
import { wodAnalysisUpdateSchema } from '@wod-coach-ai/validation';

const thruster = {
  name: 'Thrusters',
  category: 'weightlifting' as const,
  reps: 45,
  loadDescription: null,
};
const clean = {
  name: 'Hang power clean',
  category: 'weightlifting' as const,
  reps: 60,
  loadDescription: null,
};

describe('manual WOD loads', () => {
  it('clears legacy English missing-load notices once the load is filled', () => {
    expect(
      reconcileLoadWarnings(
        ['load not specified for Hang power clean', 'Do not increase the load if you have pain.'],
        [{ ...clean, loadDescription: '50 kg' }],
      ),
    ).toEqual(['Do not increase the load if you have pain.']);
    expect(reconcileLoadWarnings(['load not specified for Hang power clean'], [clean])).toContain(
      'load not specified for Hang power clean',
    );
  });
  it('preserves ladders and movement order while applying a load to all matching rounds', () => {
    const rounds = [21, 15, 9].map((reps, index) => ({
      roundNumber: index + 1,
      movements: [
        { ...thruster, reps },
        { name: 'T2B', category: 'gymnastics' as const, reps },
      ],
    }));
    const result = applyLoadOverrides(
      [thruster, clean],
      rounds,
      [{ name: 'Thruster', category: 'weightlifting', loadDescription: '60/40 kg' }],
      [
        'Cargas para Thrusters nao informadas',
        'Carga nao informada para Thrusters, Hang power clean; confirme antes de executar.',
        'Preserve o grip.',
      ],
    );
    expect(result.rounds).toEqual(
      rounds.map((round) => ({
        ...round,
        movements: [{ ...round.movements[0], loadDescription: '60/40 kg' }, round.movements[1]],
      })),
    );
    expect(result.warnings).toEqual([
      'Carga nao informada para Hang power clean; confirme antes de executar.',
      'Preserve o grip.',
    ]);
    expect(rounds[0]!.movements[0]!.loadDescription).toBeNull();
  });

  it('does not flatten mixed loads or apply an ambiguous/unmatched override', () => {
    const rounds = [40, 50].map((load, index) => ({
      roundNumber: index + 1,
      movements: [{ ...thruster, loadDescription: `${load} kg` }],
    }));
    const overrides = [
      { name: 'Thruster', category: 'weightlifting' as const, loadDescription: '60 kg' },
    ];
    expect(applyLoadOverrides([thruster], rounds, overrides, []).accepted).toEqual([]);
    expect(applyLoadOverrides([thruster, thruster], null, overrides, []).accepted).toEqual([]);
    expect(applyLoadOverrides([clean], null, overrides, []).movements).toEqual([clean]);
  });

  it('keeps unresolved and safety warnings while clearing resolved missing-load notices', () => {
    expect(
      reconcileLoadWarnings(
        [
          'Carga para Hang power clean nao informada',
          'Nao aumente a carga se houver dor.',
          'Tempo nao informado',
        ],
        [{ ...clean, loadDescription: '50 kg' }],
      ),
    ).toEqual(['Nao aumente a carga se houver dor.', 'Tempo nao informado']);
    expect(
      reconcileLoadWarnings(
        ['Cargas para Thrusters e Hang power clean nao informadas'],
        [{ ...thruster, loadDescription: '40 kg' }, clean],
      ),
    ).toEqual(expect.arrayContaining(['Cargas para Thrusters e Hang power clean nao informadas']));
  });

  it('validates partial updates, explicit clearing, and rejects empty edits', () => {
    expect(
      wodAnalysisUpdateSchema.safeParse({ movementLoads: [{ id: 'm', loadDescription: null }] })
        .success,
    ).toBe(true);
    expect(wodAnalysisUpdateSchema.safeParse({ durationMinutes: 16 }).success).toBe(true);
    expect(wodAnalysisUpdateSchema.safeParse({}).success).toBe(false);
    expect(wodAnalysisUpdateSchema.safeParse({ movementLoads: [] }).success).toBe(false);
  });
});
