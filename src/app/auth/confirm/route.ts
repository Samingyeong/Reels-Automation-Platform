import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createUserClientFromCookies } from "@/server/supabase";

/**
 * 이메일 링크(가입 확인·비밀번호 재설정) 처리 → 세션 쿠키 생성 후 next 로 이동.
 * https://supabase.com/docs/guides/auth/server-side/nextjs , /docs/guides/auth/passwords
 * - PKCE: `?code=` → exchangeCodeForSession (같은 브라우저에서 요청한 경우)
 * - 토큰 해시: `?token_hash=&type=` → verifyOtp (메일 템플릿을 token_hash 방식으로 바꾼 경우, 다른 기기에서도 동작)
 */
const ALLOWED_NEXT = new Set(["/", "/reset-password"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = ALLOWED_NEXT.has(nextParam) ? nextParam : "/"; // 오픈 리다이렉트 방지
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createUserClientFromCookies();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (ok) return NextResponse.redirect(new URL(next, url.origin));
  const reason = next === "/reset-password" ? "reset_link_invalid" : "confirm_link_invalid";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));
}
