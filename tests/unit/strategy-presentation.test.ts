import { describe, expect, it } from 'vitest';
import {
  compactStrategyTarget,
  isAnalysisReviewWarning,
  prescribedLoadForNote,
  readableStrategyText,
} from '../../apps/web/src/lib/strategy-presentation.js';
import type { WodAnalysis } from '../../apps/web/src/lib/api.js';

describe('compact strategy presentation', () => {
  it('keeps safety and execution warnings visible even when they mention interpretation', () => {
    expect(
      isAnalysisReviewWarning('Interpretei Bar M.u como Bar muscle-up. Confirme o movimento.'),
    ).toBe(true);
    for (const warning of [
      'Interpretei OHS; reduza a carga se houver dor.',
      'Confirme o movimento com o coach devido à lesão.',
      'Formato incerto; risco de ultrapassar o cap.',
      'Pouco histórico; confirme a escala.',
    ])
      expect(isAnalysisReviewWarning(warning)).toBe(false);
  });
  it('removes internal terminology without discarding the recommendation', () => {
    expect(
      readableStrategyText('Dados insuficientes (dataSufficiency low); confirme a escala.'),
    ).toBe('Dados insuficientes; confirme a escala.');
  });
  it('only removes a repeated cap when it is displayed separately', () => {
    const target = 'Terminar entre 8:30-11:30, dentro do time cap de 12:00';
    expect(compactStrategyTarget(target, true)).toBe('8:30-11:30');
    expect(compactStrategyTarget(target, false)).toContain('time cap de 12:00');
  });
  it('uses the saved round loads and never guesses a uniform weight for a ladder', () => {
    const movement = { name: 'Overhead squat', loadDescription: '43 kg' };
    const analysis = {
      roundBreakdown: [{ movements: [movement] }, { movements: [{ ...movement }] }],
      movements: [{ ...movement, loadDescription: '999 kg' }],
    } as WodAnalysis;
    expect(prescribedLoadForNote('Overhead squat (12 por round)', analysis)).toBe('43 kg');
    analysis.roundBreakdown![1]!.movements[0]!.loadDescription = '50 kg';
    expect(prescribedLoadForNote('Overhead squat', analysis)).toBeNull();
    expect(prescribedLoadForNote('OHS', analysis)).toBeNull();
    analysis.roundBreakdown![1]!.movements[0]!.loadDescription = null;
    expect(prescribedLoadForNote('Overhead squat', analysis)).toBeNull();
  });
});
