import { LoginForm } from "@/components/home/login-form";

export default function LoginPage() {
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
        <LoginForm />
      </div>
    </main>
  );
}
