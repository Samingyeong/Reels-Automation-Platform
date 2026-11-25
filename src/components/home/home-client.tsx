"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Clapperboard, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/studio/status-pill";
import type { ProjectListItem } from "@/components/studio/types";
import { api, ApiError } from "@/lib/api-client";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

const DURATIONS = [15, 30, 45, 60] as const;

export function HomeClient({ projects, email }: { projects: ProjectListItem[]; email: string | null }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const p = await api<{ id: string; revision: number }>("/api/projects", {
          body: { topic, targetDurationSec: duration },
        });
        await api(`/api/projects/${p.id}/script/generate`, { body: { revision: p.revision } });
        router.push(`/projects/${p.id}`);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "프로젝트를 만들지 못했습니다.");
      }
    });
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">R</div>
          <span className="font-semibold">Reels Studio</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{email}</span>
          <Button variant="ghost" size="sm" onClick={signOut} aria-label="로그아웃">
            <LogOut /> 로그아웃
          </Button>
        </div>
      </header>

      <section className="mt-6 rounded-3xl border bg-card p-5 sm:p-7">
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Sparkles className="size-5 text-primary" /> 어떤 숏폼을 만들까요?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">주제를 적으면 AI 가 장면별 대본을 씁니다. 단계마다 확인하고 승인해야 다음으로 넘어갑니다.</p>
        <Textarea
          data-testid="topic-input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예) 아침 커피, 언제 마시는 게 가장 좋을까?"
          className="mt-4 min-h-24 resize-none text-base"
          maxLength={500}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="영상 길이">
            <span className="mr-1 text-sm text-muted-foreground">길이</span>
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={duration === d}
                onClick={() => setDuration(d)}
                className={cn(
                  "h-8 rounded-full border px-3 text-sm transition-colors",
                  duration === d ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d}초
              </button>
            ))}
          </div>
          <Button data-testid="create-project" size="lg" onClick={create} disabled={pending || topic.trim().length < 2}>
            {pending ? "대본 요청 중…" : "대본 만들기"} <ArrowRight />
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">내 프로젝트</h2>
        {projects.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed py-14 text-sm text-muted-foreground">
            <Clapperboard className="mb-2 size-6" />
            아직 만든 숏폼이 없습니다.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  data-testid="project-card"
                  className="group flex h-full flex-col justify-between gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div>
                    <p className="line-clamp-2 font-medium group-hover:text-primary">{p.title || p.topic}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.updated_at).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
