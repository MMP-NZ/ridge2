import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Tests share one Postgres test database and run real migrations
    // against it — keep them sequential rather than racing DDL/truncates
    // across parallel workers. The suite is small enough that this costs
    // very little wall-clock time.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
