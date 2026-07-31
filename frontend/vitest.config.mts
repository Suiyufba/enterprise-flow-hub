import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Vite 8 transforms TSX with oxc, which otherwise inherits the project's
  // `jsx: "preserve"` from tsconfig.json and leaves JSX unparsed in tests.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // The workspace package points at raw TS source; let Vitest resolve it
      // directly instead of relying on Next.js's transpilation.
      shared: path.resolve(import.meta.dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
});
