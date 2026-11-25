"use client";
import { createBrowserClient } from "@supabase/ssr";

/** 브라우저 Supabase 클라이언트 (로그인 전용). 세션은 쿠키에 저장되어 서버 API 가 getClaims() 로 검증한다. */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
