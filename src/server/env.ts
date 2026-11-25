import "server-only";
import { z } from "zod";

/**
 * 서버 전용 환경변수 (docs/decisions.md DR-011, DR-015).
 *
 * APP_ENV
 *  - local : 로컬 개발. 로컬 Supabase, Trigger.dev 가 없으면 inline 실행 허용.
 *  - cloud : 실제 배포(Vercel·Trigger.dev). Trigger.dev 연결이 **필수**이며, 누락되면 요청을 오류로 막는다.
 *            로컬 실행으로 조용히 바뀌지 않는다.
 *  미설정 시: Vercel 에서 실행 중이면(VERCEL=1) cloud, 아니면 local.
 */
const Raw = z.object({
  APP_ENV: z.enum(["local", "cloud"]).optional(),
  VERCEL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  /** trigger | inline | none(테스트). local 에서 미설정 시 TRIGGER_SECRET_KEY 가 있으면 trigger, 없으면 inline */
  JOB_DISPATCH_MODE: z.enum(["inline", "trigger", "none"]).optional(),
  TRIGGER_SECRET_KEY: z.string().min(1).optional(),
});

export type ServerEnv = {
  APP_ENV: "local" | "cloud";
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  JOB_DISPATCH_MODE: "inline" | "trigger" | "none";
  TRIGGER_SECRET_KEY?: string;
};

export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

/** 순수 함수: 환경변수 객체 → 검증된 설정 (테스트 가능) */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  // 빈 문자열(.env 의 `KEY=`)은 미설정으로 취급
  const env = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = Raw.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new EnvConfigError(`서버 환경변수가 올바르지 않습니다: ${keys} (.env.example 참고)`);
  }
  const d = parsed.data;
  const appEnv = d.APP_ENV ?? (d.VERCEL === "1" ? "cloud" : "local");

  if (appEnv === "cloud") {
    if (d.JOB_DISPATCH_MODE && d.JOB_DISPATCH_MODE !== "trigger") {
      throw new EnvConfigError(`APP_ENV=cloud 에서는 JOB_DISPATCH_MODE=${d.JOB_DISPATCH_MODE} 를 사용할 수 없습니다 (trigger 만 허용).`);
    }
    if (!d.TRIGGER_SECRET_KEY) {
      throw new EnvConfigError("Trigger.dev 연결이 없습니다: APP_ENV=cloud 에는 TRIGGER_SECRET_KEY 가 필요합니다. 로컬 실행으로 대체하지 않습니다.");
    }
    if (/127\.0\.0\.1|localhost/.test(d.NEXT_PUBLIC_SUPABASE_URL)) {
      throw new EnvConfigError("APP_ENV=cloud 인데 Supabase URL 이 로컬 주소입니다.");
    }
  }

  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_SUPABASE_URL: d.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: d.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: d.SUPABASE_SECRET_KEY,
    TRIGGER_SECRET_KEY: d.TRIGGER_SECRET_KEY,
    JOB_DISPATCH_MODE: appEnv === "cloud" ? "trigger" : (d.JOB_DISPATCH_MODE ?? (d.TRIGGER_SECRET_KEY ? "trigger" : "inline")),
  };
}

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** 테스트에서 환경 변경 후 캐시 초기화 */
export function resetServerEnvCache() {
  cached = null;
}
