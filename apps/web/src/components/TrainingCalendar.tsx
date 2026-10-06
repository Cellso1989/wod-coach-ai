import { CalendarDays, Check, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type TrainingCalendarEntry } from '../lib/api.js';
import { cn } from './ui.js';

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function TrainingCalendar() {
  const [today, setToday] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [entries, setEntries] = useState<TrainingCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    return day;
  });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const start = weekStart.toISOString();
  const end = weekEnd.toISOString();
  const todayKey = dayKey(today);
  const activeDay = selectedDay ?? dayKey(weekOffset === 0 ? today : weekStart);
  const completedDays = new Set(entries.map((entry) => dayKey(new Date(entry.completedAt))));
  const selectedEntries = entries.filter(
    (entry) => dayKey(new Date(entry.completedAt)) === activeDay,
  );
  const dateLabel = (date: Date) =>
    date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setToday((previous) => (dayKey(previous) === dayKey(now) ? previous : now));
    }, 60_000);
    const onFocus = () => setRefresh((value) => value + 1);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api
      .getTrainingCalendar(start, end, controller.signal)
      .then(({ entries }) => {
        if (!controller.signal.aborted) setEntries(entries);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [start, end, refresh]);

  function changeWeek(offset: number) {
    setWeekOffset(offset);
    setSelectedDay(null);
  }

  const iconButton =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-30';

  return (
    <section aria-label="Calendário de treinos" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <CalendarDays size={16} className="text-orange-500" aria-hidden="true" />
            Seus treinos
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            {dateLabel(days[0]!)} a {dateLabel(days[6]!)} · {days[6]!.getFullYear()}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className={iconButton}
            aria-label="Semana anterior"
            title="Semana anterior"
            onClick={() => changeWeek(weekOffset - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Semana atual"
            title="Semana atual"
            onClick={() => changeWeek(0)}
            disabled={weekOffset === 0}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Próxima semana"
            title="Próxima semana"
            onClick={() => changeWeek(weekOffset + 1)}
            disabled={weekOffset >= 0}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        aria-busy={loading}
        className="rounded-lg border border-orange-900/50 bg-neutral-900 px-2 py-4"
      >
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = dayKey(day);
            const completed = !loading && !error && completedDays.has(key);
            const isToday = key === todayKey;
            const label = day.toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });
            return (
              <button
                type="button"
                key={key}
                disabled={loading || error}
                aria-pressed={key === activeDay}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${label}: ${completed ? 'treino concluído' : 'sem resultado'}`}
                title={label}
                onClick={() => setSelectedDay(key)}
                className="flex min-w-0 flex-col items-center gap-3 rounded-md py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
              >
                <span
                  className={cn(
                    'text-xs',
                    isToday ? 'font-semibold text-orange-500' : 'text-neutral-400',
                  )}
                >
                  {isToday
                    ? 'Hoje'
                    : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day.getDay()]}
                </span>
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm',
                    completed
                      ? 'border-orange-600 bg-orange-600 text-white'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-300',
                    key === activeDay && 'ring-2 ring-orange-500/40',
                  )}
                >
                  {completed ? <Check size={18} aria-hidden="true" /> : day.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div aria-live="polite" className="space-y-2 text-xs">
        {loading ? (
          <p className="text-neutral-500">Carregando treinos...</p>
        ) : error ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-red-400">Não foi possível carregar o calendário.</p>
            <button
              type="button"
              className={iconButton}
              title="Tentar novamente"
              aria-label="Tentar novamente"
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        ) : (
          <>
            <p className="text-neutral-500">
              {completedDays.size} de 7 dias com resultado nesta semana
            </p>
            {selectedEntries.length > 0 ? (
              <ul className="divide-y divide-neutral-800">
                {selectedEntries.map((entry) => (
                  <li key={entry.wodId}>
                    <Link
                      to={`${entry.discipline === 'HYROX' ? '/hyrox' : '/wods'}/${entry.wodId}`}
                      className="flex items-center justify-between gap-3 py-2 text-neutral-200 hover:text-orange-500"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {entry.name ??
                            (entry.discipline === 'HYROX' ? 'Treino HYROX' : 'WOD sem nome')}
                        </span>
                        <span className="block break-words text-neutral-400">{entry.score}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-neutral-400">Nenhum resultado neste dia.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
