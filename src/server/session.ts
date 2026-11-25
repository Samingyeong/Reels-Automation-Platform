import "server-only";
import { redirect } from "next/navigation";
import { createUserClientFromCookies } from "./supabase";

/** 페이지(Server Component) 접근 시 로그인 확인. getClaims() 로 서명 검증 후 사용자 id 반환. */
export async function requirePageUser(): Promise<{ userId: string; email: string | null }> {
  const db = await createUserClientFromCookies();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.role !== "authenticated") redirect("/login");
  return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
