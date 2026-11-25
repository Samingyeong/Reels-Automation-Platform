import "server-only";
import { z } from "zod";
import { transition, type JobKind, type PipelineEvent, type PipelineEventType, type ProjectStatus } from "../../domain/pipeline";
import { ProjectOptions, Script } from "../../domain/schemas";
import { ProviderError, type Providers } from "../../providers/types";
import type { Database } from "../database.types";
import { fromDbError } from "../errors";
import type { DbOp } from "../ops";
import type { Db } from "../supabase";

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export type RunnerDeps = {
  db: Db;
  providers: Providers;
  /** 재시도 백오프(초). 기본: 10s, 30s, 90s ... */
  retryDelaySeconds?: (attempt: number) => number;
  leaseSeconds?: number;
};

export type RunOutcome =
  | { status: "skipped"; reason: string }
  | { status: "succeeded" }
  | { status: "canceled"; reason: string }
  | { status: "retry_scheduled"; error: string }
  | { status: "failed"; error: string };

/** 작업 종류 → 진행 중 상태 / 실패 이벤트 매핑 */
const STAGE: Partial<Record<JobKind, { running: ProjectStatus; failed: PipelineEventType; actor: string }>> = {
  script: { running: "SCRIPT_GENERATING", failed: "SCRIPT_FAILED", actor: "worker:script" },
};

type Handler = (deps: RunnerDeps, job: JobRow) => Promise<{ event: PipelineEventType; ops: DbOp[] }>;

/** 워커 이벤트의 목표 상태는 도메인 상태 머신으로 계산한다 (단일 진실 공급원). */
function targetStatus(from: ProjectStatus, event: PipelineEventType): ProjectStatus {
  const r = transition(from, { type: event } as PipelineEvent);
  if (!r.ok) throw new Error(r.reason);
  return r.to;
}

const HANDLERS: Partial<Record<JobKind, Handler>> = {
  script: runScriptJob,
};

/**
 * 작업 1건 실행. 같은 작업이 동시에 두 번 전달되어도 claim_job 의 lease 로 한 번만 실행된다.
 * 성공 결과 저장 + 프로젝트 상태 전이 + 작업 완료 표시는 apply_transition 한 번(트랜잭션)으로 처리한다.
 */
export async function runJob(deps: RunnerDeps, jobId: string): Promise<RunOutcome> {
  const { db } = deps;
  const { data: claimed, error: claimError } = await db.rpc("claim_job", {
    p_job_id: jobId,
    p_lease_seconds: deps.leaseSeconds ?? 300,
  });
  if (claimError) throw fromDbError(claimError);
  const job = claimed as JobRow | null;
  if (!job || !job.id) return { status: "skipped", reason: "이미 실행 중이거나 대기 시간이 남은 작업" };

  const handler = HANDLERS[job.kind];
  const stage = STAGE[job.kind];
  if (!handler || !stage) {
    await db.rpc("release_job_for_retry", { p_job_id: job.id, p_error: "no handler", p_delay_seconds: 60 });
    return { status: "skipped", reason: `실행기가 없는 작업 종류: ${job.kind}` };
  }

  // 작업이 만들어진 뒤 프로젝트가 다른 상태로 바뀌었으면(사용자 수정·재요청) 결과를 버린다
  const project = await loadProjectState(db, job.project_id);
  if (!project || project.status !== stage.running || project.revision !== job.project_revision) {
    await db.rpc("cancel_job", { p_job_id: job.id, p_reason: "stale: project changed" });
    return { status: "canceled", reason: "프로젝트 상태가 변경되어 작업이 무효화됨" };
  }

  try {
    const { event, ops } = await handler(deps, job);
    const to = targetStatus(stage.running, event);
    const { error } = await db.rpc("apply_transition", {
      p_project_id: job.project_id,
      p_actor_user_id: null as unknown as string,
      p_actor: stage.actor,
      p_event: event,
      p_expected_status: stage.running,
      p_expected_revision: job.project_revision,
      p_to_status: to,
      p_ops: [...ops, { op: "complete_job", jobId: job.id, result: { provider: job.provider } }] as never,
    });
    if (error) {
      const se = fromDbError(error);
      if (se.code === "REVISION_CONFLICT") {
        await db.rpc("cancel_job", { p_job_id: job.id, p_reason: "stale: revision conflict on completion" });
        return { status: "canceled", reason: "완료 시점에 프로젝트가 변경됨" };
      }
      throw se;
    }
    return { status: "succeeded" };
  } catch (err) {
    return handleFailure(deps, job, stage, err);
  }
}

async function handleFailure(
  deps: RunnerDeps,
  job: JobRow,
  stage: NonNullable<(typeof STAGE)[JobKind]>,
  err: unknown,
): Promise<RunOutcome> {
  const { db } = deps;
  const retryable = err instanceof ProviderError ? err.retryable : !(err instanceof z.ZodError);
  const message = sanitizeError(err);

  if (retryable) {
    const delay = (deps.retryDelaySeconds ?? defaultBackoff)(job.attempt);
    const { data: verdict } = await db.rpc("release_job_for_retry", {
      p_job_id: job.id,
      p_error: message,
      p_delay_seconds: delay,
    });
    if (verdict === "requeued") return { status: "retry_scheduled", error: message };
  }

  // 재시도 불가 또는 시도 횟수 소진 → 작업 실패 + 프로젝트 *_FAILED (원자적)
  const { error } = await db.rpc("apply_transition", {
    p_project_id: job.project_id,
    p_actor_user_id: null as unknown as string,
    p_actor: stage.actor,
    p_event: stage.failed,
    p_expected_status: stage.running,
    p_expected_revision: job.project_revision,
    p_to_status: targetStatus(stage.running, stage.failed),
    p_ops: [{ op: "fail_job", jobId: job.id, error: message, retryable }] as never,
    p_error: message,
  });
  if (error) {
    // 프로젝트가 이미 바뀌었으면 작업만 취소 (실패를 성공으로 바꾸지 않는다)
    await db.rpc("cancel_job", { p_job_id: job.id, p_reason: `stale after failure: ${message}` });
    return { status: "canceled", reason: "실패 처리 시점에 프로젝트가 변경됨" };
  }
  return { status: "failed", error: message };
}

function defaultBackoff(attempt: number): number {
  return Math.min(600, 10 * 3 ** Math.max(0, attempt - 1));
}

/** 오류 메시지에서 키·토큰처럼 보이는 문자열 제거, 길이 제한 */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof z.ZodError ? `응답 형식 오류: ${err.issues.map((i) => i.path.join(".")).join(", ")}` : err instanceof Error ? err.message : String(err);
  return raw
    .replace(/(sk|sb|rm|key|token)[-_][A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

async function loadProjectState(db: Db, projectId: string) {
  const { data } = await db
    .from("projects")
    .select("id, status, revision, topic, options")
    .eq("id", projectId)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// 핸들러: 대본 생성
// ---------------------------------------------------------------------------
async function runScriptJob(deps: RunnerDeps, job: JobRow) {
  const project = await loadProjectState(deps.db, job.project_id);
  if (!project) throw new ProviderError("project disappeared", { provider: "db", retryable: false });
  const options = ProjectOptions.parse(project.options ?? {});
  const raw = await deps.providers.script.generateScript({ topic: project.topic, ...options });
  // provider 결과를 그대로 믿지 않는다: 스키마 검증 실패는 재시도 불가 실패
  const script = Script.parse(raw);
  return {
    event: "SCRIPT_SUCCEEDED" as const,
    ops: [{ op: "replace_script", script } as DbOp],
  };
}
