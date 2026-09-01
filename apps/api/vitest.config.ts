import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["../../tests/unit/**/*.test.ts", "../../tests/integration/**/*.test.ts"],
    env: {
      JWT_SECRET: "test-secret-do-not-use-in-production",
    },
  },
});
