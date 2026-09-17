import { useEffect, useRef, useState } from "react";
import type { TreadmillEffort, TreadmillWorkout } from "../lib/api.js";

const EFFORT_LABELS: Record<TreadmillEffort, string> = {
  leve: "Leve",
  moderado: "Moderado",
  moderado_alto: "Moderado alto",
  forte: "Forte",
  maximo: "Máximo",
};

const EFFORT_COLORS: Record<TreadmillEffort, string> = {
  leve: "bg-blue-600/20 text-blue-400 border-blue-900/50",
  moderado: "bg-green-600/20 text-green-400 border-green-900/50",
  moderado_alto: "bg-yellow-600/20 text-yellow-400 border-yellow-900/50",
  forte: "bg-orange-600/20 text-orange-400 border-orange-900/50",
  maximo: "bg-red-600/20 text-red-400 border-red-900/50",
};

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function playBeep(context: AudioContext) {
  try {
    if (context.state === "suspended") {
      void context.resume();
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch {
    // Ambiente sem suporte a Web Audio — segue só com o aviso visual/vibração.
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // iOS Safari não suporta vibração — ignora silenciosamente.
    }
  }
}

interface TreadmillTimerProps {
  workout: TreadmillWorkout;
  audioContext: AudioContext | null;
  onExit: () => void;
}

export function TreadmillTimer({ workout, audioContext, onExit }: TreadmillTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);

  const startTimeRef = useRef(Date.now());
  const baseElapsedRef = useRef(0);
  const prevBlockIndexRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const totalSeconds = workout.durationMinutes * 60;

  useEffect(() => {
    if (paused || finished) return;

    const interval = setInterval(() => {
      const elapsed = baseElapsedRef.current + (Date.now() - startTimeRef.current) / 1000;
      setElapsedSeconds(Math.min(elapsed, totalSeconds));
    }, 250);

    return () => clearInterval(interval);
  }, [paused, finished, totalSeconds]);

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    async function requestWakeLock() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Bloqueado (ex: pouca bateria) — segue sem travar a tela.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !paused && !finished) {
        void requestWakeLock();
      }
    }

    if (!paused && !finished) {
      void requestWakeLock();
    } else {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [paused, finished]);

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  const currentBlockIndex = workout.blocks.findIndex(
    (block) => elapsedSeconds < block.endMinute * 60,
  );
  const effectiveIndex =
    currentBlockIndex === -1 ? workout.blocks.length - 1 : currentBlockIndex;
  const currentBlock = workout.blocks[effectiveIndex];
  const nextBlock = workout.blocks[effectiveIndex + 1] ?? null;

  useEffect(() => {
    if (elapsedSeconds >= totalSeconds && !finished) {
      setFinished(true);
      vibrate([200, 100, 200, 100, 400]);
      if (audioContext) {
        playBeep(audioContext);
        setTimeout(() => playBeep(audioContext), 300);
      }
      return;
    }

    if (prevBlockIndexRef.current === null) {
      prevBlockIndexRef.current = effectiveIndex;
      return;
    }
    if (effectiveIndex !== prevBlockIndexRef.current && !finished) {
      prevBlockIndexRef.current = effectiveIndex;
      vibrate([200, 100, 200]);
      if (audioContext) playBeep(audioContext);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIndex, elapsedSeconds, totalSeconds, finished]);

  function handlePauseResume() {
    if (paused) {
      startTimeRef.current = Date.now();
      setPaused(false);
    } else {
      baseElapsedRef.current = elapsedSeconds;
      setPaused(true);
    }
  }

  function handleStop() {
    if (window.confirm("Encerrar o treino? O progresso do cronômetro não fica salvo.")) {
      onExit();
    }
  }

  if (!currentBlock) {
    return null;
  }

  const blockRemaining = currentBlock.endMinute * 60 - elapsedSeconds;
  const totalRemaining = totalSeconds - elapsedSeconds;
  const blockLengthSeconds = (currentBlock.endMinute - currentBlock.startMinute) * 60;
  const blockElapsed = blockLengthSeconds - blockRemaining;
  const progressPct = blockLengthSeconds > 0 ? Math.min(100, Math.max(0, (blockElapsed / blockLengthSeconds) * 100)) : 100;

  if (finished) {
    return (
      <div className="space-y-4 rounded-lg border border-green-900/50 bg-neutral-900 p-6 text-center">
        <p className="text-2xl font-bold text-green-400">Treino concluído! 🎉</p>
        <p className="text-sm text-neutral-400">
          Nível {workout.level} — {workout.durationMinutes} min
        </p>
        <button
          type="button"
          onClick={onExit}
          className="w-full rounded-lg bg-orange-600 py-3 font-semibold transition-colors duration-150 hover:bg-orange-700 active:bg-orange-800"
        >
          Concluir
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div
        className={`space-y-2 rounded-lg border p-6 text-center ${EFFORT_COLORS[currentBlock.effort]}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide">
          {EFFORT_LABELS[currentBlock.effort]}
        </p>
        <p className="text-3xl font-bold text-neutral-100">{currentBlock.speedRange} km/h</p>
        <p className="text-4xl font-bold tabular-nums text-neutral-100">
          {formatMmSs(blockRemaining)}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-current transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {nextBlock && (
        <p className="text-center text-sm text-neutral-500">
          Próximo: {nextBlock.speedRange} km/h · {EFFORT_LABELS[nextBlock.effort]}
        </p>
      )}

      <p className="text-center text-sm text-neutral-400">
        Faltam {formatMmSs(totalRemaining)} no total
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePauseResume}
          className="flex-1 rounded-lg border border-neutral-700 py-3 text-sm font-semibold text-neutral-300"
        >
          {paused ? "▶ Continuar" : "⏸ Pausar"}
        </button>
        <button
          type="button"
          onClick={handleStop}
          className="flex-1 rounded-lg border border-red-900/50 py-3 text-sm font-semibold text-red-400"
        >
          ⏹ Encerrar
        </button>
      </div>
    </div>
  );
}
