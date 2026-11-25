"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

const ALLOWED_NEXT = new Set(["/", "/reset-password"]);

/**
 * 이메일 링크(implicit flow) 착지 페이지: URL hash 의 토큰으로 쿠키 세션을 만든 뒤 next 로 이동.
 * hash 는 서버로 전송되지 않으므로 클라이언트에서 처리하고, 처리 직후 주소창에서 지운다.
 */
export default function AuthCallbackPage() {
  const [message, setMessage] = useState("로그인 정보를 확인하는 중…");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const nextParam = query.get("next") ?? "/";
    const next = ALLOWED_NEXT.has(nextParam) ? nextParam : "/";
    const fail = () => window.location.replace(`/login?error=${next === "/reset-password" ? "reset_link_invalid" : "confirm_link_invalid"}`);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken || hash.get("error")) {
      fail();
      return;
    }
    supabaseBrowser()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) fail();
        else {
          setMessage("이동하는 중…");
          window.location.replace(next);
        }
      });
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <p className="text-sm text-muted-foreground" data-testid="auth-callback">
        {message}
      </p>
    </main>
  );
}
