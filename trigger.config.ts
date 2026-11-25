import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles, aptGet } from "@trigger.dev/build/extensions/core";
import { esbuildPlugin } from "@trigger.dev/build/extensions";

/**
 * Trigger.dev 설정 (공식 trigger-setup / trigger-tasks skill 기준).
 *  - 재시도는 DB(jobs.attempt, run_after)가 관리한다 → 태스크 자체 재시도는 끈다 (중복 실행 방지, DR-008)
 *  - 렌더: Remotion 사전 번들(.remotion-bundle)을 함께 배포하고, Chromium 실행용 시스템 라이브러리를 설치
 *    (https://www.remotion.dev/docs/miscellaneous/linux-dependencies)
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_set_TRIGGER_PROJECT_REF",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 1800,
  legacyDevProcessCwdBehaviour: false,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  build: {
    // 네이티브 컴포지터 바이너리를 포함하므로 번들하지 않고 런타임에 설치
    external: ["@remotion/renderer", "@remotion/compositor-linux-x64-gnu", "@remotion/compositor-linux-arm64-gnu"],
    extensions: [
      additionalFiles({ files: [".remotion-bundle/**"] }),
      aptGet({
        packages: [
          "libnss3",
          "libdbus-1-3",
          "libatk1.0-0",
          "libgbm-dev",
          "libasound2",
          "libxrandr2",
          "libxkbcommon-dev",
          "libxfixes3",
          "libxcomposite1",
          "libxdamage1",
          "libpango-1.0-0",
          "libcairo2",
          "libcups2",
          "libatk-bridge2.0-0",
        ],
      }),
      // Next.js 의 "server-only" 가드는 워커 런타임에서 의미가 없으므로 빈 모듈로 대체
      esbuildPlugin({
        name: "server-only-noop",
        setup(build) {
          build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "noop" }));
          build.onLoad({ filter: /.*/, namespace: "noop" }, () => ({ contents: "export {};", loader: "js" }));
        },
      }),
    ],
  },
});
