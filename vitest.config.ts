import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15_000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "src/client/main.tsx",
        "src/client/vite-env.d.ts",
        "src/client/sw-template.js",
      ],
      thresholds: {
        lines: 60,
        functions: 55,
        statements: 60,
        branches: 45,
      },
    },
  },
});
