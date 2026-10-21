import type { WodAnalysis } from '../lib/api.js';

export function WorkoutDetails({ analysis }: { analysis: WodAnalysis }) {
  const blocks = analysis.roundBreakdown?.length
    ? analysis.roundBreakdown.map((round) => ({
        label: round.label?.trim() || `Round ${round.roundNumber}`,
        movements: round.movements,
      }))
    : [{ label: 'Movimentos', movements: analysis.movements }];

  return (
    <details className="mt-3 border-t border-neutral-800 pt-3">
      <summary className="cursor-pointer text-sm font-semibold text-orange-400 focus-visible:outline-orange-500">
        Ver treino completo
      </summary>
      <div className="mt-4 space-y-4 break-words">
        {analysis.durationMinutes != null && (
          <p className="text-sm text-neutral-400">
            {['FOR_TIME', 'ROUNDS_FOR_TIME', 'CHIPPER'].includes(analysis.format ?? '')
              ? 'Time cap'
              : 'Duração'}
            : {analysis.durationMinutes} min
          </p>
        )}
        {blocks.map((block, index) => (
          <div key={index} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-400">
              {block.label}
            </h3>
            <ul className="space-y-2 text-sm text-neutral-200">
              {block.movements.map((movement, movementIndex) => (
                <li key={movementIndex} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span>{movement.name}</span>
                  {movement.reps != null && (
                    <span className="text-neutral-400">{movement.reps} reps</span>
                  )}
                  {movement.distanceMeters != null && (
                    <span className="text-neutral-400">{movement.distanceMeters} m</span>
                  )}
                  {movement.calories != null && (
                    <span className="text-neutral-400">{movement.calories} cal</span>
                  )}
                  {movement.loadDescription && (
                    <span className="min-w-0 max-w-full break-words text-orange-400 [overflow-wrap:anywhere]">
                      {movement.loadDescription}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
