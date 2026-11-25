import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/home/reset-password-form";
import { createUserClientFromCookies } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** 비밀번호 재설정: /auth/confirm 이 재설정 링크로 만든 세션이 있어야 접근 가능 */
export default async function ResetPasswordPage() {
  const supabase = await createUserClientFromCookies();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?error=reset_link_invalid");

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">새 비밀번호 설정</h1>
          <p className="mt-1 text-sm text-muted-foreground">{String(data.claims.email ?? "")}</p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
