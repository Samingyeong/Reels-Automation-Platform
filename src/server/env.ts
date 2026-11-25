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
  /**
   * 임시 실행 모드 (DR-015 예외, 사용자 승인 2026-11-25): Trigger.dev prod 배포가 막힌 동안
   * cloud 에서 JOB_DISPATCH_MODE=inline 을 **명시적으로** 허용한다. 렌더 작업은 실행하지 않고 대기시킨다.
   */
  CLOUD_TEMPORARY_INLINE: z.literal("1").optional(),
});

export type ServerEnv = {
  APP_ENV: "local" | "cloud";
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  JOB_DISPATCH_MODE: "inline" | "trigger" | "none";
  TRIGGER_SECRET_KEY?: string;
  /** cloud 임시 실행 모드 여부 (UI 배지·렌더 보류) */
  TEMPORARY_INLINE: boolean;
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

  const temporaryInline = appEnv === "cloud" && d.CLOUD_TEMPORARY_INLINE === "1" && d.JOB_DISPATCH_MODE === "inline";
  if (appEnv === "cloud" && d.CLOUD_TEMPORARY_INLINE === "1" && d.JOB_DISPATCH_MODE !== "inline") {
    throw new EnvConfigError("CLOUD_TEMPORARY_INLINE=1 은 JOB_DISPATCH_MODE=inline 과 함께만 사용할 수 있습니다.");
  }
  if (appEnv === "cloud" && !temporaryInline) {
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

  if (temporaryInline && /127\.0\.0\.1|localhost/.test(d.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new EnvConfigError("APP_ENV=cloud 인데 Supabase URL 이 로컬 주소입니다.");
  }

  return {
    APP_ENV: appEnv,
    TEMPORARY_INLINE: temporaryInline,
    NEXT_PUBLIC_SUPABASE_URL: d.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: d.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: d.SUPABASE_SECRET_KEY,
    TRIGGER_SECRET_KEY: d.TRIGGER_SECRET_KEY,
    JOB_DISPATCH_MODE: temporaryInline ? "inline" : appEnv === "cloud" ? "trigger" : (d.JOB_DISPATCH_MODE ?? (d.TRIGGER_SECRET_KEY ? "trigger" : "inline")),
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
