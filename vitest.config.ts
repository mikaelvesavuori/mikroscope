import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/performance/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["api/src/**/*.ts", "app/**/*.js"],
      exclude: [
        "**/interfaces/*.ts",
        "**/interfaces/**/*.ts",
        "api/src/**/index.ts",
        "api/src/cli.ts",
      ],
    },
  },
});
