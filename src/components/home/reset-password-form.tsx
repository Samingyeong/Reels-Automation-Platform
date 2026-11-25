"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { NewPasswordFields, readNewPassword, submit } from "./password-fields";

/** 재설정 링크로 로그인된 상태에서 새 비밀번호 저장 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(form: FormData) {
    const { password, error: invalid } = readNewPassword(form);
    setError(invalid);
    if (invalid) return;
    startTransition(async () => {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) {
        setError(
          error.code === "same_password"
            ? "이전과 다른 비밀번호를 입력하세요."
            : error.code === "weak_password"
              ? "더 안전한 비밀번호를 입력하세요."
              : "비밀번호를 바꾸지 못했습니다. 재설정 링크를 다시 요청하세요.",
        );
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1200);
    });
  }

  if (done) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-sm" role="status">
        비밀번호를 변경했습니다. 잠시 후 이동합니다…
      </p>
    );
  }

  return (
    <form onSubmit={submit(onSubmit)} className="space-y-4 rounded-2xl border bg-card p-6" data-testid="reset-password-form">
      <NewPasswordFields label="새 비밀번호" />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "저장 중…" : "비밀번호 변경"}
      </Button>
    </form>
  );
}
