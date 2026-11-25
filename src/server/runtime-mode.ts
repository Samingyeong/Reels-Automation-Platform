import "server-only";
import { serverEnv } from "./env";

/** cloud 임시 실행 모드 여부 (설정 오류 시 false — 오류 표시는 API 응답이 담당) */
export function isTemporaryInlineMode(): boolean {
  try {
    return serverEnv().TEMPORARY_INLINE;
  } catch {
    return false;
  }
}
