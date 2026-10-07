import type { WodAnalysisOutput, StrategyOutput } from '@wod-coach-ai/validation';

export const ladderSource = 'Wod\n21-15-9\nThrusters\nT2B\n12-10-8\nBar m.u';
const names = ['Thrusters', 'Toes-to-bar', 'Bar Muscle-up'];
const volumes = [
  [21, 15, 9],
  [21, 15, 9],
  [12, 10, 8],
];
export const ladderAnalysis: WodAnalysisOutput = {
  format: 'FOR_TIME',
  durationMinutes: 12,
  stimulus: 'mixed_modal',
  movements: names.map((name, index) => ({
    name,
    category: index === 0 ? 'weightlifting' : 'gymnastics',
    reps: volumes[index]!.reduce((sum, value) => sum + value, 0),
  })),
  rounds: [0, 1, 2].map((index) => ({
    roundNumber: index + 1,
    label: `Round ${index + 1}`,
    movements: names.map((name, movementIndex) => ({
      name,
      category: movementIndex === 0 ? 'weightlifting' : 'gymnastics',
      reps: volumes[movementIndex]![index],
    })),
  })),
  estimatedDemand: { engine: 8, grip: 9, legs: 7, gymnastics: 9, technical: 8 },
  estimatedIntensity: 9,
  confidence: 0.9,
  warnings: [],
};
export const ladderStrategy: StrategyOutput = {
  recommendedIntensity: 9,
  targetRpe: 10,
  loadRecommendation: null,
  pacing: 'R1 controlado; R2 mantenha; R3 acelere. Thrusters, T2B e BMU em cada round.',
  breakStrategy: names.map((name, index) => ({
    movement: `${name} (${volumes[index]!.join('-')} por round)`,
    strategy: index === 2 ? 'R1: 6/6; R2: 5/5; R3: 4/4.' : 'R1: 7/7/7; R2: 8/7; R3: 9 direto.',
  })),
  movementStrategy: names.map((name, index) => ({
    movement: `${name} (${volumes[index]!.join('-')} por round)`,
    strategy: 'Respire e preserve a tecnica em cada round.',
  })),
  restStrategy: 'Pausas curtas antes de falhar.',
  transitionStrategy: 'Thrusters -> T2B -> BMU; repita no round seguinte.',
  energyManagement: 'Preserve o grip no primeiro round.',
  goal: 'Concluir os tres rounds na ordem prescrita.',
  target: 'Dentro do cap de 12 min',
  criticalPoint: 'Grip',
  warnings: [],
  confidence: 0.8,
};
