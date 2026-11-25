import { execSync } from "node:child_process";

/**
 * 로컬 Supabase 접속 정보를 `supabase status -o env` 에서 읽어 서버 환경변수로 설정한다.
 * CI 에서도 같은 방식 (supabase start 후 실행). 실제 키가 아닌 로컬 개발용 기본 키다.
 */
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const vars = Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  if (!vars.API_URL) throw new Error("로컬 Supabase 가 실행 중이 아닙니다: npx supabase start");
  process.env.NEXT_PUBLIC_SUPABASE_URL = vars.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = vars.PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY = vars.SECRET_KEY;
}
process.env.JOB_DISPATCH_MODE ??= "none";
process.env.PROVIDER_MODE ??= "mock";
process.env.PUBLISH_MODE ??= "mock";
