import "server-only";
import { z } from "zod";

/** 서버 전용 환경변수. 누락 시 사용 시점에 명확한 에러. */
const ServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  /**
   * trigger: Trigger.dev 태스크로 실행 (운영 기본, TRIGGER_SECRET_KEY 필요)
   * inline : 응답 후 같은 프로세스에서 실행 (Trigger.dev 없이 로컬 개발·E2E)
   * none   : outbox 에만 기록 (테스트)
   * 미설정 시 TRIGGER_SECRET_KEY 가 있으면 trigger, 없으면 inline.
   */
  JOB_DISPATCH_MODE: z.enum(["inline", "trigger", "none"]).optional(),
  TRIGGER_SECRET_KEY: z.string().min(1).optional(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`서버 환경변수가 올바르지 않습니다: ${keys} (.env.example 참고)`);
  }
  cached = {
    ...parsed.data,
    JOB_DISPATCH_MODE: parsed.data.JOB_DISPATCH_MODE ?? (parsed.data.TRIGGER_SECRET_KEY ? "trigger" : "inline"),
  };
  return cached;
}

/** 테스트에서 환경 변경 후 캐시 초기화 */
export function resetServerEnvCache() {
  cached = null;
}
