import { LoginForm } from "@/components/home/login-form";

const ERRORS: Record<string, string> = {
  reset_link_invalid: "비밀번호 재설정 링크가 만료되었거나 올바르지 않습니다. 다시 요청하세요. (링크는 요청한 브라우저에서 열어야 합니다)",
  confirm_link_invalid: "확인 링크가 만료되었거나 올바르지 않습니다. 로그인하거나 다시 가입하세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
            R
          </div>
          <h1 className="text-2xl font-bold">Reels Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">주제만 입력하면 대본부터 렌더까지, 단계마다 직접 검수하세요.</p>
        </div>
        <LoginForm initialError={error ? (ERRORS[error] ?? null) : null} />
      </div>
    </main>
  );
}
