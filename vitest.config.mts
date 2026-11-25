import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/providers/contract.ts"],
    environment: "node",
  },
});
