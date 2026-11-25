"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const MIN_PASSWORD_LENGTH = 8;

/** 새 비밀번호 + 확인 입력. 두 값이 다르면 안내하고 form 제출을 막는다(setCustomValidity). */
export function NewPasswordFields({ label = "비밀번호" }: { label?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="password">{label}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{MIN_PASSWORD_LENGTH}자 이상</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password-confirm">{label} 확인</Label>
        <Input
          id="password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          aria-invalid={mismatch || undefined}
          onChange={(e) => {
            setConfirm(e.target.value);
            e.target.setCustomValidity(e.target.value === password ? "" : "비밀번호가 일치하지 않습니다.");
          }}
          ref={(el) => el?.setCustomValidity(confirm === password ? "" : "비밀번호가 일치하지 않습니다.")}
        />
        {mismatch ? (
          <p className="text-xs text-destructive" data-testid="password-mismatch">
            비밀번호가 일치하지 않습니다.
          </p>
        ) : confirm.length > 0 ? (
          <p className="text-xs text-emerald-600">비밀번호가 일치합니다.</p>
        ) : null}
      </div>
    </>
  );
}

/** 서버로 보내기 전 최종 확인 (브라우저 검증을 우회한 경우 대비) */
export function readNewPassword(form: FormData): { password: string; error: string | null } {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("passwordConfirm") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) return { password, error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  if (password !== confirm) return { password, error: "비밀번호가 일치하지 않습니다." };
  return { password, error: null };
}

/**
 * form onSubmit 어댑터. React 19 의 `<form action>` 은 제출 후 입력값을 초기화하므로
 * (로그인 실패 시 이메일이 지워짐) onSubmit + preventDefault 로 입력을 유지한다.
 */
export function submit(handler: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
  };
}
