import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["lib/schema/**", "lib/engine/**", "lib/srs/**", "lib/repositories/**", "lib/content/**", "lib/pipeline/**"],
      exclude: ["**/*.test.*", "**/README.md"],
      thresholds: { lines: 80 },
    },
  },
});
