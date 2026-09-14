import type { TrainingFrequencyWeek } from "../lib/api.js";

const CHART_HEIGHT = 80;
const WOD_COLOR = "#3987e5";
const TREADMILL_COLOR = "#199e70";

interface TrainingFrequencyChartProps {
  weeks: TrainingFrequencyWeek[];
}

export function TrainingFrequencyChart({ weeks }: TrainingFrequencyChartProps) {
  const hasData = weeks.some((w) => w.wodCount + w.treadmillCount > 0);
  const maxTotal = Math.max(1, ...weeks.map((w) => w.wodCount + w.treadmillCount));

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">Frequência de treinos</h2>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: WOD_COLOR }}
              aria-hidden="true"
            />
            WODs
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TREADMILL_COLOR }}
              aria-hidden="true"
            />
            Esteira
          </span>
        </div>
      </div>

      {!hasData ? (
        <p className="text-sm text-neutral-500">
          Nenhum treino registrado nas últimas {weeks.length} semanas.
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-1" style={{ height: CHART_HEIGHT }}>
            {weeks.map((week) => {
              const total = week.wodCount + week.treadmillCount;
              const wodHeight = (week.wodCount / maxTotal) * CHART_HEIGHT;
              const treadmillHeight = (week.treadmillCount / maxTotal) * CHART_HEIGHT;
              return (
                <div
                  key={week.weekStart}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                  title={`Semana de ${new Date(week.weekStart).toLocaleDateString("pt-BR")}: ${week.wodCount} WOD(s), ${week.treadmillCount} esteira`}
                >
                  <span className="text-[10px] text-neutral-500">{total > 0 ? total : ""}</span>
                  <div className="flex w-full max-w-[18px] flex-col-reverse overflow-hidden rounded-t">
                    <div style={{ height: `${wodHeight}px`, backgroundColor: WOD_COLOR }} />
                    {treadmillHeight > 0 && (
                      <div
                        style={{
                          height: `${treadmillHeight}px`,
                          backgroundColor: TREADMILL_COLOR,
                          marginTop: 2,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-neutral-600">
            {weeks.map((week) => (
              <span key={week.weekStart} className="flex-1 text-center">
                {new Date(week.weekStart).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
