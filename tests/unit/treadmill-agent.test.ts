import { describe, it, expect } from "vitest";
import { generateTreadmillWorkout } from "@wod-coach-ai/coach-engine";

const DURATIONS = [5, 10, 15, 25, 40, 60];
const LEVELS = [1, 2, 3, 4, 5];

describe("generateTreadmillWorkout", () => {
  for (const level of LEVELS) {
    for (const durationMinutes of DURATIONS) {
      it(`produces contiguous blocks for level ${level} / ${durationMinutes}min`, () => {
        const workout = generateTreadmillWorkout(level, durationMinutes);

        expect(workout.level).toBe(level);
        expect(workout.durationMinutes).toBe(durationMinutes);
        expect(workout.blocks.length).toBeGreaterThan(0);

        expect(workout.blocks[0].startMinute).toBe(0);
        expect(workout.blocks[workout.blocks.length - 1].endMinute).toBe(durationMinutes);

        for (let i = 0; i < workout.blocks.length; i++) {
          const block = workout.blocks[i];
          expect(block.startMinute).toBeLessThan(block.endMinute);
          expect(Number.isInteger(block.startMinute)).toBe(true);
          expect(Number.isInteger(block.endMinute)).toBe(true);

          if (i > 0) {
            expect(block.startMinute).toBe(workout.blocks[i - 1].endMinute);
          }
        }
      });
    }
  }

  it("clamps out-of-range level instead of throwing (level 0)", () => {
    const workout = generateTreadmillWorkout(0, 15);
    expect(workout.level).toBeGreaterThanOrEqual(1);
    expect(workout.level).toBeLessThanOrEqual(5);
    expect(workout.blocks[0].startMinute).toBe(0);
    expect(workout.blocks[workout.blocks.length - 1].endMinute).toBe(15);
  });

  it("clamps out-of-range level instead of throwing (level 8)", () => {
    const workout = generateTreadmillWorkout(8, 20);
    expect(workout.level).toBeGreaterThanOrEqual(1);
    expect(workout.level).toBeLessThanOrEqual(5);
    expect(workout.blocks[0].startMinute).toBe(0);
    expect(workout.blocks[workout.blocks.length - 1].endMinute).toBe(20);
  });
});
