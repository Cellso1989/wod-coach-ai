import { describe, expect, it } from 'vitest';
import type { HyroxStrategy, WodStrategy } from '../../apps/web/src/lib/api.js';
import {
  formatHyroxStrategy,
  formatWodStrategy,
  whatsappShareUrl,
} from '../../apps/web/src/lib/strategy-share.js';

const wod: WodStrategy = {
  id: 'strategy',
  wodId: 'wod',
  recommendedIntensity: 7,
  targetRpe: 8,
  loadRecommendation: null,
  target: null,
  criticalPoint: null,
  confidence: 0.8,
  goal: 'Manter consistencia',
  pacing: 'Comecar controlado',
  breakStrategy: [{ movement: 'Pull-up', strategy: '5 + 5' }],
  movementStrategy: [{ movement: 'Squat', strategy: 'Sem pausa' }],
  restStrategy: '10 segundos',
  transitionStrategy: 'Transicoes curtas',
  energyManagement: 'Acelerar no final',
  warnings: ['Evitar falha'],
};

const hyrox: HyroxStrategy = {
  workoutSummary: 'Corrida e estacoes',
  target: '60 minutos',
  runPace: '5:00/km',
  pacing: 'Ritmo constante',
  blockPlan: [
    { block: 'Run', focus: 'Controle', execution: '1 km constante' },
    { block: 'SkiErg', focus: 'Respiracao', execution: 'Puxadas consistentes' },
  ],
  breakStrategy: [],
  transitionStrategy: 'Caminhar pouco',
  criticalRisk: 'Fadiga de pernas',
  finalPush: 'Acelerar na ultima corrida',
  warnings: [],
  confidence: 0.9,
};

describe('WhatsApp strategy sharing', () => {
  it('keeps WOD execution instructions and warnings, omitting absent sections', () => {
    const text = formatWodStrategy(wod, 'Fran');
    expect(text).toContain('*Treino*\nFran');
    expect(text).toContain('*Quebras*\n- Pull-up: 5 + 5');
    expect(text).toContain('*Execucao por movimento*\n- Squat: Sem pausa');
    expect(text).toContain('*Pontos de atencao*\n- Evitar falha');
    expect(text).not.toMatch(/\*Meta\*|\*Carga\*|\*Ponto critico\*|undefined|null/);
  });

  it('preserves HYROX block order and omits empty lists and missing names', () => {
    const text = formatHyroxStrategy(hyrox);
    expect(text).toContain('1. Run\nControle\n1 km constante\n\n2. SkiErg');
    expect(text).toContain('*Ritmo de corrida*\n5:00/km');
    expect(text).toContain('*Final*\nAcelerar na ultima corrida');
    expect(text).not.toMatch(/\*Treino\*|\*Quebras\*|\*Pontos de atencao\*/);
  });

  it('round-trips accents, line breaks and URL characters without changing the message', () => {
    const text = formatWodStrategy(
      { ...wod, pacing: 'Respira\u00e7\u00e3o & ritmo + 10%\nSegunda linha?' },
      'A&B #1',
    );
    const url = new URL(whatsappShareUrl(text));
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toBe(text);
    expect([...url.searchParams.keys()]).toEqual(['text']);
  });

  it('does not silently discard long plans or their warnings', () => {
    const pacing = 'Ritmo constante. '.repeat(400);
    const text = formatWodStrategy({ ...wod, pacing });
    expect(new URL(whatsappShareUrl(text)).searchParams.get('text')).toContain(pacing.trim());
    expect(text).toContain('- Evitar falha');
  });
});
