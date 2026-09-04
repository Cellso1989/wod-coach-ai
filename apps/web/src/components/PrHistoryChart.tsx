import { useState } from "react";

export interface PrHistoryPoint {
  achievedAt: string;
  value: number;
}

interface PrHistoryChartProps {
  history: PrHistoryPoint[]; // ordered oldest -> newest
  unit: string;
}

const WIDTH = 300;
const HEIGHT = 120;
const PAD_X = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

export function PrHistoryChart({ history, unit }: PrHistoryChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  if (history.length === 0) return null;

  const values = history.map((h) => h.value);
  const times = history.map((h) => new Date(h.achievedAt).getTime());
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = maxV - minV || 1;
  const minT = times[0]!;
  const maxT = times[times.length - 1] ?? minT;
  const tSpan = maxT - minT || 1;

  function xAt(i: number): number {
    return PAD_X + ((times[i]! - minT) / tSpan) * (WIDTH - PAD_X * 2);
  }
  function yAt(v: number): number {
    return HEIGHT - PAD_BOTTOM - ((v - minV) / span) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  }

  const points = history.map((h, i) => `${xAt(i)},${yAt(h.value)}`).join(" ");
  const last = history[history.length - 1]!;
  const hovered = hoverIndex != null ? history[hoverIndex] : null;

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    history.forEach((_, i) => {
      const d = Math.abs(xAt(i) - pointerX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <line
            x1={PAD_X}
            y1={HEIGHT - PAD_BOTTOM}
            x2={WIDTH - PAD_X}
            y2={HEIGHT - PAD_BOTTOM}
            stroke="#27272a"
            strokeWidth={1}
          />

          {hovered && (
            <line
              x1={xAt(hoverIndex!)}
              y1={PAD_TOP}
              x2={xAt(hoverIndex!)}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="#3f3f46"
              strokeWidth={1}
            />
          )}

          <polyline points={points} fill="none" stroke="#f97316" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {history.map((h, i) => (
            <circle
              key={h.achievedAt + i}
              cx={xAt(i)}
              cy={yAt(h.value)}
              r={i === history.length - 1 || i === hoverIndex ? 4 : 2.5}
              fill="#f97316"
              stroke="#171717"
              strokeWidth={2}
            />
          ))}

          <text x={xAt(history.length - 1)} y={yAt(last.value) - 10} textAnchor="end" className="fill-neutral-300 text-[10px]">
            {last.value} {unit}
          </text>
        </svg>

        {hovered && (
          <div className="pointer-events-none absolute top-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs shadow"
            style={{ left: `${Math.min(Math.max((xAt(hoverIndex!) / WIDTH) * 100, 15), 85)}%`, transform: "translateX(-50%)" }}
          >
            <p className="font-semibold text-neutral-100">{hovered.value} {unit}</p>
            <p className="text-neutral-500">{new Date(hovered.achievedAt).toLocaleDateString("pt-BR")}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="text-xs text-neutral-500"
      >
        {showTable ? "Ocultar tabela" : "Ver tabela"}
      </button>

      {showTable && (
        <table className="w-full text-xs text-neutral-400">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="font-normal">Data</th>
              <th className="font-normal">Valor</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.achievedAt + i}>
                <td>{new Date(h.achievedAt).toLocaleDateString("pt-BR")}</td>
                <td>
                  {h.value} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
