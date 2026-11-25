"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { NewPasswordFields, readNewPassword, submit } from "./password-fields";

type Mode = "signin" | "signup" | "forgot";

const TITLES: Record<Mode, string> = { signin: "로그인", signup: "가입하고 시작하기", forgot: "재설정 메일 보내기" };

/** 이메일 링크가 돌아올 주소. /auth/confirm 이 세션을 만든 뒤 next 로 보낸다. */
function confirmUrl(next: string) {
  return `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function onSubmit(form: FormData) {
    const email = String(form.get("email") ?? "").trim();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const supabase = supabaseBrowser();

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: confirmUrl("/reset-password") });
        // 가입 여부를 노출하지 않도록 결과와 관계없이 같은 안내 (요청 제한 오류만 별도 표시)
        if (error && error.status === 429) {
          setError("요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
          return;
        }
        setNotice("가입된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인하세요.");
        return;
      }

      if (mode === "signup") {
        const { password, error: invalid } = readNewPassword(form);
        if (invalid) {
          setError(invalid);
          return;
        }
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirmUrl("/") } });
        if (error) {
          setError(error.status === 429 ? "요청이 너무 많습니다. 잠시 후 다시 시도하세요." : error.message);
          return;
        }
        if (!data.session) {
          // 이메일 확인이 켜진 환경(클라우드): 메일 링크를 눌러야 로그인된다
          setNotice(`${email} 로 확인 메일을 보냈습니다. 메일의 링크를 누르면 로그인됩니다.`);
          setMode("signin");
          return;
        }
      } else {
        const password = String(form.get("password") ?? "");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(
            error.code === "email_not_confirmed" ? "이메일 확인이 필요합니다. 가입 확인 메일의 링크를 눌러주세요." : "이메일 또는 비밀번호를 확인하세요.",
          );
          return;
        }
      }
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <form key={mode} onSubmit={submit(onSubmit)} className="space-y-4 rounded-2xl border bg-card p-6" data-testid={`auth-form-${mode}`}>
      {mode === "forgot" ? (
        <p className="text-sm text-muted-foreground">가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.</p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      {mode === "signin" ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">비밀번호</Label>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => switchMode("forgot")}>
              비밀번호를 잊으셨나요?
            </button>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
      ) : mode === "signup" ? (
        <NewPasswordFields />
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="auth-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-muted p-3 text-sm" role="status" data-testid="auth-notice">
          {notice}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "확인 중…" : TITLES[mode]}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "계정이 없나요? 가입하기" : mode === "signup" ? "이미 계정이 있나요? 로그인" : "로그인으로 돌아가기"}
      </button>
    </form>
  );
}
