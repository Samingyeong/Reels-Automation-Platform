import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: 실제 브라우저에서 전체 사용자 흐름 (Mock provider, inline 작업 실행, 실제 Remotion 렌더).
 * 사전 조건: 로컬 Supabase 실행 + `npm run build`. 서버는 아래 webServer 가 띄운다 (이미 떠 있으면 재사용).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 6 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { JOB_DISPATCH_MODE: "inline", PROVIDER_MODE: "mock", PUBLISH_MODE: "mock" },
  },
});
