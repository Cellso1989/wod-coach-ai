import type { HyroxStrategy, WodStrategy } from './api.js';

function section(title: string, text: string | null | undefined): string {
  return text?.trim() ? `*${title}*\n${text.trim()}` : '';
}

function notes(items: Array<{ movement: string; strategy: string }>): string {
  return items.map((item) => `- ${item.movement}: ${item.strategy}`).join('\n');
}

function message(sections: string[]): string {
  return [...sections.filter(Boolean), '_WOD Coach AI_'].join('\n\n');
}

export function formatWodStrategy(strategy: WodStrategy, workoutName?: string | null): string {
  return message([
    '*Estrategia WOD*',
    section('Treino', workoutName),
    section('Meta', strategy.target),
    section('Objetivo', strategy.goal),
    section('Intensidade', `${strategy.recommendedIntensity}/10 | RPE ${strategy.targetRpe}`),
    section('Carga', strategy.loadRecommendation),
    section('Ritmo', strategy.pacing),
    section('Quebras', notes(strategy.breakStrategy)),
    section('Execucao por movimento', notes(strategy.movementStrategy)),
    section('Descanso', strategy.restStrategy),
    section('Transicoes', strategy.transitionStrategy),
    section('Energia', strategy.energyManagement),
    section('Ponto critico', strategy.criticalPoint),
    section('Pontos de atencao', strategy.warnings.map((warning) => `- ${warning}`).join('\n')),
  ]);
}

export function formatHyroxStrategy(strategy: HyroxStrategy, workoutName?: string | null): string {
  return message([
    '*Estrategia HYROX*',
    section('Treino', workoutName),
    section('Resumo', strategy.workoutSummary),
    section('Meta', strategy.target),
    section('Ritmo de corrida', strategy.runPace),
    section('Ritmo', strategy.pacing),
    section(
      'Plano por blocos',
      strategy.blockPlan
        .map((block, index) => `${index + 1}. ${block.block}\n${block.focus}\n${block.execution}`)
        .join('\n\n'),
    ),
    section('Quebras', notes(strategy.breakStrategy)),
    section('Transicoes', strategy.transitionStrategy),
    section('Ponto critico', strategy.criticalRisk),
    section('Final', strategy.finalPush),
    section('Pontos de atencao', strategy.warnings.map((warning) => `- ${warning}`).join('\n')),
  ]);
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
