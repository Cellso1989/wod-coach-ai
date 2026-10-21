import { StrategySection } from '../components/StrategySection.js';
import { WorkoutDetails } from '../components/WorkoutDetails.js';
import { PageShell } from '../components/ui.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import type { WodAnalysis, WodStrategy } from '../lib/api.js';

const movements: WodAnalysis['movements'] = [
  {
    id: 'ohs',
    order: 0,
    name: 'Overhead squat',
    category: 'weightlifting',
    reps: 12,
    distanceMeters: null,
    calories: null,
    loadDescription: '43 kg',
  },
  {
    id: 'burpee',
    order: 1,
    name: 'Burpee over bar',
    category: 'conditioning',
    reps: 10,
    distanceMeters: null,
    calories: null,
    loadDescription: null,
  },
  {
    id: 'bmu',
    order: 2,
    name: 'Bar muscle-up',
    category: 'gymnastics',
    reps: 8,
    distanceMeters: null,
    calories: null,
    loadDescription: null,
  },
];
const analysis: WodAnalysis = {
  id: 'demo',
  wodId: 'demo',
  format: 'ROUNDS_FOR_TIME',
  durationMinutes: 12,
  stimulus: null,
  estimatedIntensity: null,
  engineDemand: null,
  gripDemand: null,
  legDemand: null,
  gymnasticsDemand: null,
  technicalDemand: null,
  confidence: 0.9,
  warnings: [],
  movements,
  roundBreakdown: [1, 2, 3, 4].map((roundNumber) => ({ roundNumber, movements })),
};
const strategy: WodStrategy = {
  id: 'demo',
  wodId: 'demo',
  recommendedIntensity: 10,
  targetRpe: 10,
  loadRecommendation: null,
  target: '8:30–11:30',
  goal: 'Termine dentro do cap, mantendo a técnica e evitando falhas na barra.',
  pacing: 'Comece controlado; acelere nas voltas 2 e 3 e termine forte.',
  restStrategy: '10–15 s entre movimentos; até 30 s entre voltas se necessário.',
  breakStrategy: [
    { movement: 'Overhead squat (12 por round)', strategy: '6 + 6; 1 respiração entre séries.' },
    {
      movement: 'Burpee over bar (10 por round)',
      strategy: '10 direto, sem acelerar a respiração cedo.',
    },
    {
      movement: 'Bar muscle-up (8 por round)',
      strategy: '4 + 4; use 4 + 2 + 2 se perder a cadência.',
    },
  ],
  transitionStrategy: 'Deixe a barra e o espaço preparados para reduzir o tempo parado.',
  energyManagement: 'Controle a respiração nas transições e preserve a pegada no início.',
  movementStrategy: [
    {
      movement: 'Overhead squat',
      strategy: 'Mantenha estabilidade e amplitude; adapte com o coach se houver dor.',
    },
  ],
  criticalPoint: 'Técnica no OHS sob fadiga',
  confidence: 0.5,
  warnings: [
    'Se houver dor lombar, reduza a carga ou adapte com o coach.',
    'Pouco histórico; confirme a escala com o coach.',
    "Interpretei 'Bar M.u' como Bar muscle-up. Confirme o movimento.",
  ],
};

export function StrategyPreviewPage() {
  return (
    <PageShell>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">
            Prévia local · dados fictícios
          </p>
          <h1 className="mt-2 text-xl font-bold">Seu plano de execução</h1>
          <p className="mt-1 text-sm text-neutral-400">4 voltas · 12 OHS / 10 burpees / 8 BMU</p>
          <WorkoutDetails analysis={analysis} />
        </div>
        <ThemeToggle />
      </header>
      <StrategySection
        wodId="demo"
        workoutName="Treino de exemplo"
        initialStrategy={strategy}
        analysis={analysis}
        disabled
      />
    </PageShell>
  );
}
