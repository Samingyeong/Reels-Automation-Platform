import "server-only";
import { z } from "zod";

/** 서버 전용 환경변수. 누락 시 사용 시점에 명확한 에러. */
const ServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  /** inline: 요청 처리 후 같은 프로세스에서 작업 실행 (개발/테스트). trigger: Trigger.dev (M2). none: outbox 에만 기록. */
  JOB_DISPATCH_MODE: z.enum(["inline", "trigger", "none"]).default("inline"),
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
  cached = parsed.data;
  return cached;
}

/** 테스트에서 환경 변경 후 캐시 초기화 */
export function resetServerEnvCache() {
  cached = null;
}
