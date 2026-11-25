#!/usr/bin/env node
// 로컬 Supabase(`npm run db:start`) 접속 정보를 앱 환경변수 형식으로 출력한다.
//   node scripts/local-env.mjs > .env.local          (로컬 개발)
//   node scripts/local-env.mjs >> "$GITHUB_ENV"      (CI)
// 출력 값은 로컬 개발용 기본 키이며 실제 프로젝트 키가 아니다.
import { execSync } from "node:child_process";

const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const vars = Object.fromEntries(
  out
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!vars.API_URL) {
  console.error("로컬 Supabase 가 실행 중이 아닙니다: npm run db:start");
  process.exit(1);
}
const lines = {
  NEXT_PUBLIC_SUPABASE_URL: vars.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: vars.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: vars.SECRET_KEY,
  JOB_DISPATCH_MODE: "inline",
  PROVIDER_MODE: "mock",
  PUBLISH_MODE: "mock",
};
process.stdout.write(Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
