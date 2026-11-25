"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser, supabaseEmailLinkClient } from "@/lib/supabase-browser";
import { NewPasswordFields, readNewPassword, submit } from "./password-fields";

type Mode = "signin" | "signup" | "forgot";

const TITLES: Record<Mode, string> = { signin: "로그인", signup: "가입하고 시작하기", forgot: "재설정 메일 보내기" };

/** 메일 발송 관련 오류 → 사용자 안내. 무료 기본 메일은 시간당 발송 수가 제한된다. */
function emailErrorMessage(error: { status?: number; code?: string }, fallback: string) {
  if (error.status === 429 || error.code?.includes("rate_limit")) {
    return "메일 발송 한도를 초과했습니다 (무료 메일은 시간당 2통). 메일은 보내지지 않았습니다. 1시간쯤 뒤에 다시 시도하세요.";
  }
  return fallback;
}

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastEmail, setLastEmail] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);

  function resendConfirmation() {
    setError(null);
    startTransition(async () => {
      const { error } = await supabaseEmailLinkClient().auth.resend({
        type: "signup",
        email: lastEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      setUnconfirmed(false);
      if (error) setError(emailErrorMessage(error, "확인 메일을 보내지 못했습니다."));
      else setNotice(`${lastEmail} 로 확인 메일을 다시 보냈습니다.`);
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
  }

  function onSubmit(form: FormData) {
    const email = String(form.get("email") ?? "").trim();
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    startTransition(async () => {
      const supabase = supabaseBrowser();

      if (mode === "forgot") {
        const { error } = await supabaseEmailLinkClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        // 미가입 이메일도 Supabase 는 성공(200)으로 응답하므로 가입 여부는 드러나지 않는다.
        // 오류는 실제 발송 실패(요청 제한·메일 서버 오류)뿐 → "보냈습니다"로 표시하면 안 된다.
        if (error) {
          setError(emailErrorMessage(error, "재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도하세요."));
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
        // implicit 링크: 확인 메일을 다른 기기에서 열어도 /auth/callback 에서 로그인된다
        const { data, error } = await supabaseEmailLinkClient().auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
        });
        if (error) {
          setError(emailErrorMessage(error, error.message));
          return;
        }
        if (!data.session) {
          // 이메일 확인이 켜진 환경(클라우드): 메일 링크를 눌러야 로그인된다
          setLastEmail(email);
          setMode("signin");
          setNotice(`${email} 로 확인 메일을 보냈습니다. 메일의 "Confirm" 링크를 눌러야 가입이 완료되고 로그인됩니다. 확인 전에는 비밀번호로 로그인할 수 없습니다.`);
          return;
        }
        const { error: sessionError } = await supabase.auth.setSession(data.session);
        if (sessionError) {
          setError("가입은 되었지만 로그인하지 못했습니다. 다시 로그인하세요.");
          return;
        }
      } else {
        const password = String(form.get("password") ?? "");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.code === "email_not_confirmed") {
            setLastEmail(email);
            setUnconfirmed(true);
            setError("아직 이메일 확인이 안 됐습니다. 가입 확인 메일의 링크를 눌러주세요. (비밀번호 문제가 아닙니다)");
          } else {
            setError("이메일 또는 비밀번호를 확인하세요.");
          }
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
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={lastEmail} />
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
      {unconfirmed ? (
        <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={resendConfirmation} data-testid="resend-confirmation">
          확인 메일 다시 보내기
        </Button>
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
