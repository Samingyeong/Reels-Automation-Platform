import "server-only";
import { ServiceError } from "./errors";
import { createUserClientFromCookies, createUserClientFromToken, type Db } from "./supabase";

export type AuthContext = { userId: string; db: Db };

/**
 * 요청의 사용자를 검증한다. getClaims() 는 JWT 서명을 검증하므로 쿠키 위조를 신뢰하지 않는다.
 * - Authorization: Bearer 헤더가 있으면 그 토큰을 사용 (API 클라이언트·테스트)
 * - 없으면 쿠키 세션 (브라우저)
 */
export async function requireUser(request: Request): Promise<AuthContext> {
  const header = request.headers.get("authorization");
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!token && !request.headers.get("cookie")) {
    throw new ServiceError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }
  const db = token ? createUserClientFromToken(token) : await createUserClientFromCookies();
  const { data, error } = token ? await db.auth.getClaims(token) : await db.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated") {
    throw new ServiceError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }
  return { userId: sub, db };
}
