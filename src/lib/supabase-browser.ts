"use client";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/** 브라우저 Supabase 클라이언트 (로그인 전용). 세션은 쿠키에 저장되어 서버 API 가 getClaims() 로 검증한다. */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}

/**
 * 이메일 링크 요청 전용 클라이언트 (implicit flow).
 * @supabase/ssr 클라이언트는 PKCE 고정이라 링크를 "요청한 브라우저"에서만 열 수 있다
 * (PC 에서 요청 → 휴대폰 메일 앱에서 열면 실패). implicit 링크는 토큰을 URL hash 로 돌려주므로
 * 어느 기기에서 열어도 /auth/callback 이 세션을 만든다. 메일 템플릿을 token_hash 방식으로 바꾸면
 * (커스텀 SMTP 필요) /auth/confirm 으로 대체 가능.
 */
export function supabaseEmailLinkClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
