import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/server/database.types";
import { InlineDispatcher, NoopDispatcher, type JobDispatcher } from "../../src/server/jobs/dispatcher";
import { runJob, type RunnerDeps } from "../../src/server/jobs/runner";
import type { ServiceDeps } from "../../src/server/project-service";
import { createAdminClient, createUserClientFromToken, type Db } from "../../src/server/supabase";
import { createMockProviders } from "../../src/providers/mock";
import type { Providers } from "../../src/providers/types";
import type { Renderer } from "../../src/server/render/remotion-renderer";

export function admin(): Db {
  return createAdminClient();
}

export function anonClient(): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { userId: string; accessToken: string; db: Db };

/** 실제 Supabase Auth 로 사용자 생성 + 로그인 → 사용자 JWT (RLS 검증용) */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const anon = anonClient();
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError ?? new Error("signIn failed");
  const accessToken = session.session.access_token;
  return { userId: data.user.id, accessToken, db: createUserClientFromToken(accessToken) };
}

/**
 * 테스트용 서비스 의존성. dispatch="inline" 이면 작업을 즉시 실행하고 flush() 로 완료를 기다린다.
 */
/**
 * 테스트용 렌더러 (Chromium 없이 빠르게). 실제 Remotion 렌더는 E2E(Playwright)에서 검증한다.
 * 출력은 "가짜 MP4" 바이트이며 성공 경로의 DB·Storage 반영만 확인하기 위한 테스트 더블이다.
 */
export const fakeRenderer: Renderer = async (props) => ({
  data: new TextEncoder().encode(`test-double:${props.scenes.length}`),
  durationMs: props.scenes.reduce((s, x) => s + x.durationInFrames, 0) * (1000 / 30),
  mimeType: "video/mp4",
});

export function testDeps(opts: { dispatch?: "inline" | "none"; providers?: Providers; renderer?: Renderer } = {}) {
  const db = admin();
  const providers = opts.providers ?? createMockProviders();
  const runnerDeps: RunnerDeps = { db, providers, retryDelaySeconds: () => 0, renderer: opts.renderer ?? fakeRenderer };
  const pending: Promise<void>[] = [];
  const dispatcher: JobDispatcher =
    opts.dispatch === "inline"
      ? new InlineDispatcher(db, (id) => runJob(runnerDeps, id), (task) => void pending.push(task()))
      : new NoopDispatcher();
  const deps: ServiceDeps = { admin: db, dispatcher, providers };
  return {
    deps,
    runnerDeps,
    /** 작업이 다음 작업을 만들지 않으므로 대기열이 빌 때까지 기다린다 */
    async flush() {
      while (pending.length) await pending.shift();
    },
  };
}

export async function getProject(id: string) {
  const { data, error } = await admin().from("projects").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function getJobs(projectId: string) {
  const { data, error } = await admin().from("jobs").select("*").eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return data;
}
