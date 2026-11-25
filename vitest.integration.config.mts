import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** 로컬 Supabase(`npx supabase start`) 가 실행 중이어야 한다. */
export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/support/supabase-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
