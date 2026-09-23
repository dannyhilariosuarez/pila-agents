import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "packages/*/src/**/*.test.ts",
      "agents/*/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/dist/**",
        "**/*.d.ts",
        "packages/cli/src/index.ts",
        "packages/protocol/src/index.ts",
        "packages/protocol/src/types.ts",
      ],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 65,
        statements: 70,
      },
    },
  },
});
