import "server-only";
import { z } from "zod";
import { transition, type JobKind, type PipelineEvent, type PipelineEventType, type ProjectStatus } from "../../domain/pipeline";
import { ProjectOptions, Script, VIDEO_HEIGHT, VIDEO_WIDTH } from "../../domain/schemas";
import { ProviderError, type Providers, type SceneVideoResult } from "../../providers/types";
import { planStoragePaths, resolveCompositionPlan, type CompositionPlan } from "../content";
import type { Database, Json } from "../database.types";
import { fromDbError } from "../errors";
import type { AssetInput, DbOp } from "../ops";
import type { Renderer } from "../render/remotion-renderer";
import { mediaPath, signMedia, uploadMedia } from "../storage";
import type { Db } from "../supabase";

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export type RunnerDeps = {
  db: Db;
  providers: Providers;
  /** 렌더 작업에만 필요. 없으면 렌더 작업은 실패한다 (성공을 흉내내지 않음) */
  renderer?: Renderer;
  /** 재시도 백오프(초). 기본: 10s, 30s, 90s ... */
  retryDelaySeconds?: (attempt: number) => number;
  leaseSeconds?: number;
  /** 비동기 provider 폴링 간격·최대 횟수 */
  pollIntervalMs?: number;
  maxPolls?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type RunOutcome =
  | { status: "skipped"; reason: string }
  | { status: "succeeded" }
  | { status: "in_progress" }
  | { status: "canceled"; reason: string }
  | { status: "retry_scheduled"; error: string; delaySeconds: number }
  | { status: "failed"; error: string };

type Stage = {
  running: ProjectStatus;
  success: PipelineEventType;
  failed: PipelineEventType;
  /** 장면 단위 작업: 결과를 complete_scene_part 로 반영하고 모든 장면이 끝나면 프로젝트 전이 */
  sceneScoped: boolean;
};

const STAGES: Partial<Record<JobKind, Stage>> = {
  script: { running: "SCRIPT_GENERATING", success: "SCRIPT_SUCCEEDED", failed: "SCRIPT_FAILED", sceneScoped: false },
  scene_video: { running: "SCENES_GENERATING", success: "SCENES_SUCCEEDED", failed: "SCENES_FAILED", sceneScoped: true },
  narration: { running: "NARRATION_GENERATING", success: "NARRATION_SUCCEEDED", failed: "NARRATION_FAILED", sceneScoped: true },
  render: { running: "RENDERING", success: "RENDER_SUCCEEDED", failed: "RENDER_FAILED", sceneScoped: false },
};

type Ctx = { deps: RunnerDeps; job: JobRow; project: ProjectState };
type ProjectState = NonNullable<Awaited<ReturnType<typeof loadProjectState>>>;
type Handler = (ctx: Ctx) => Promise<{ ops: DbOp[] } | { sceneResult: Record<string, unknown> }>;

const HANDLERS: Partial<Record<JobKind, Handler>> = {
  script: runScriptJob,
  scene_video: runSceneVideoJob,
  narration: runNarrationJob,
  render: runRenderJob,
};

/** 워커 이벤트의 목표 상태는 도메인 상태 머신으로 계산한다 (단일 진실 공급원). */
function targetStatus(from: ProjectStatus, event: PipelineEventType): ProjectStatus {
  const r = transition(from, { type: event } as PipelineEvent);
  if (!r.ok) throw new Error(r.reason);
  return r.to;
}

/**
 * 작업 1건 실행. 같은 작업이 동시에 두 번 전달되어도 claim_job 의 lease 로 한 번만 실행된다.
 * 결과 저장 + 작업 완료 + (해당되면) 프로젝트 상태 전이는 RPC 한 번(트랜잭션)으로 처리한다.
 */
export async function runJob(deps: RunnerDeps, jobId: string): Promise<RunOutcome> {
  const { db } = deps;
  const { data: claimed, error: claimError } = await db.rpc("claim_job", {
    p_job_id: jobId,
    p_lease_seconds: deps.leaseSeconds ?? 900,
  });
  if (claimError) throw fromDbError(claimError);
  const job = claimed as JobRow | null;
  if (!job || !job.id) return { status: "skipped", reason: "이미 실행 중이거나 대기 시간이 남은 작업" };

  const handler = HANDLERS[job.kind];
  const stage = STAGES[job.kind];
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
    const result = await handler({ deps, job, project });
    if ("sceneResult" in result) return await completeScenePart(deps, job, stage, true, result.sceneResult, null);

    const { error } = await db.rpc("apply_transition", {
      p_project_id: job.project_id,
      p_actor_user_id: null as unknown as string,
      p_actor: `worker:${job.kind}`,
      p_event: stage.success,
      p_expected_status: stage.running,
      p_expected_revision: job.project_revision,
      p_to_status: targetStatus(stage.running, stage.success),
      p_ops: [...result.ops, { op: "complete_job", jobId: job.id, result: { provider: job.provider } }] as unknown as Json,
    });
    if (error) {
      const se = fromDbError(error);
      if (se.code === "REVISION_CONFLICT") return cancelStale(db, job, "완료 시점에 프로젝트가 변경됨");
      throw se;
    }
    return { status: "succeeded" };
  } catch (err) {
    return handleFailure(deps, job, stage, err);
  }
}

async function completeScenePart(
  deps: RunnerDeps,
  job: JobRow,
  stage: Stage,
  ok: boolean,
  result: Record<string, unknown> | null,
  error: string | null,
): Promise<RunOutcome> {
  const { data, error: rpcError } = await deps.db.rpc("complete_scene_part", {
    p_job_id: job.id,
    p_ok: ok,
    p_result: (result ?? {}) as Json,
    p_error: error as string,
    p_running_status: stage.running,
    p_success_status: targetStatus(stage.running, stage.success),
    p_failure_status: targetStatus(stage.running, stage.failed),
    p_success_event: stage.success,
    p_failure_event: stage.failed,
  });
  if (rpcError) {
    const se = fromDbError(rpcError);
    if (se.code === "REVISION_CONFLICT") return cancelStale(deps.db, job, "완료 시점에 프로젝트가 변경됨");
    throw se;
  }
  const aggregate = (data as { aggregate: string }).aggregate;
  if (!ok) return { status: "failed", error: error ?? "unknown" };
  return aggregate === "in_progress" ? { status: "in_progress" } : { status: "succeeded" };
}

async function cancelStale(db: Db, job: JobRow, reason: string): Promise<RunOutcome> {
  await db.rpc("cancel_job", { p_job_id: job.id, p_reason: `stale: ${reason}` });
  return { status: "canceled", reason };
}

async function handleFailure(deps: RunnerDeps, job: JobRow, stage: Stage, err: unknown): Promise<RunOutcome> {
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
    if (verdict === "requeued") return { status: "retry_scheduled", error: message, delaySeconds: delay };
  }

  // 재시도 불가 또는 시도 횟수 소진 → 작업 실패 + (집계 결과에 따라) 프로젝트 *_FAILED (원자적)
  if (stage.sceneScoped) {
    try {
      return await completeScenePart(deps, job, stage, false, null, message);
    } catch {
      await db.rpc("cancel_job", { p_job_id: job.id, p_reason: `stale after failure: ${message}` });
      return { status: "canceled", reason: "실패 처리 시점에 프로젝트가 변경됨" };
    }
  }

  const extraOps: DbOp[] = [];
  if (job.kind === "render") {
    const render = await currentRender(db, job.project_id);
    if (render) extraOps.push({ op: "fail_render", renderId: render.id, error: message });
  }
  const { error } = await db.rpc("apply_transition", {
    p_project_id: job.project_id,
    p_actor_user_id: null as unknown as string,
    p_actor: `worker:${job.kind}`,
    p_event: stage.failed,
    p_expected_status: stage.running,
    p_expected_revision: job.project_revision,
    p_to_status: targetStatus(stage.running, stage.failed),
    p_ops: [...extraOps, { op: "fail_job", jobId: job.id, error: message, retryable }] as unknown as Json,
    p_error: message,
  });
  if (error) {
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
  const raw =
    err instanceof z.ZodError
      ? `응답 형식 오류: ${err.issues.map((i) => i.path.join(".")).join(", ")}`
      : err instanceof Error
        ? err.message
        : String(err);
  return raw
    .replace(/(sk|sb|rm|key|token)[-_][A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .slice(0, 500);
}

async function loadProjectState(db: Db, projectId: string) {
  const { data } = await db
    .from("projects")
    .select("id, user_id, status, revision, topic, options")
    .eq("id", projectId)
    .maybeSingle();
  return data;
}

async function loadScene(db: Db, sceneId: string | null) {
  if (!sceneId) throw new ProviderError("scene job without scene_id", { provider: "db", retryable: false });
  const { data, error } = await db.from("scenes").select("*").eq("id", sceneId).single();
  if (error || !data) throw new ProviderError("scene not found", { provider: "db", retryable: false });
  return data;
}

async function currentRender(db: Db, projectId: string) {
  const { data } = await db.from("renders").select("*").eq("project_id", projectId).eq("is_current", true).maybeSingle();
  return data;
}

function inputKeyOf(job: JobRow): string | undefined {
  const payload = job.payload as { inputKey?: string } | null;
  return payload?.inputKey;
}

// ---------------------------------------------------------------------------
// 핸들러: 대본
// ---------------------------------------------------------------------------
async function runScriptJob({ deps, project }: Ctx) {
  const options = ProjectOptions.parse(project.options ?? {});
  const raw = await deps.providers.script.generateScript({ topic: project.topic, ...options });
  const script = Script.parse(raw); // provider 결과를 그대로 믿지 않는다
  return { ops: [{ op: "replace_script", script } as DbOp] };
}

// ---------------------------------------------------------------------------
// 핸들러: 장면 영상 (동기·비동기 provider 공통)
// ---------------------------------------------------------------------------
async function runSceneVideoJob({ deps, job, project }: Ctx) {
  const { db, providers } = deps;
  const scene = await loadScene(db, job.scene_id);
  const provider = providers.sceneVideo;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let r: SceneVideoResult = job.external_job_id
    ? await provider.poll(job.external_job_id) // 재시작된 작업: 저장된 외부 작업 id 로 이어서 폴링
    : await provider.start({
        prompt: scene.visual_prompt,
        durationSec: Number(scene.duration_sec),
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        variation: job.project_revision,
      });
  if (r.status === "processing") {
    await db.from("jobs").update({ external_job_id: r.externalJobId }).eq("id", job.id);
    for (let i = 0; i < (deps.maxPolls ?? 120) && r.status === "processing"; i++) {
      await sleep(deps.pollIntervalMs ?? 5000);
      r = await provider.poll(r.externalJobId);
    }
    if (r.status === "processing") {
      throw new ProviderError("영상 생성 대기 시간 초과", { provider: provider.name, retryable: true });
    }
  }
  if (r.status === "failed") throw r.error;

  const out = r.output;
  if ("placeholder" in out) return { sceneResult: { placeholder: out.placeholder, asset: null, inputKey: inputKeyOf(job) } };
  const ext = out.mimeType.startsWith("image/") ? (out.mimeType.split("/")[1] ?? "png") : "mp4";
  const uploaded = await uploadMedia(db, mediaPath(project.user_id, project.id, "scene_video", job.id, ext), out.data, out.mimeType);
  const asset: AssetInput = { ...uploaded, provider: provider.name, inputKey: inputKeyOf(job) };
  return { sceneResult: { placeholder: null, asset, inputKey: inputKeyOf(job) } };
}

// ---------------------------------------------------------------------------
// 핸들러: 나레이션 + 자막 타이밍
// ---------------------------------------------------------------------------
async function runNarrationJob({ deps, job, project }: Ctx) {
  const { db, providers } = deps;
  const scene = await loadScene(db, job.scene_id);
  const options = ProjectOptions.parse(project.options ?? {});
  const speech = await providers.speech.synthesize({ text: scene.narration, voiceId: "default", language: options.language });
  const captions =
    speech.captions ?? (await providers.caption.align({ text: scene.narration, durationMs: speech.durationMs, audio: speech.audio }));

  let asset: AssetInput | null = null;
  if (speech.audio) {
    const ext = speech.audio.mimeType === "audio/wav" ? "wav" : (speech.audio.mimeType.split("/")[1] ?? "bin");
    const uploaded = await uploadMedia(
      db,
      mediaPath(project.user_id, project.id, "narration_audio", job.id, ext),
      speech.audio.data,
      speech.audio.mimeType,
    );
    asset = { ...uploaded, durationMs: speech.durationMs, provider: providers.speech.name, inputKey: inputKeyOf(job) };
  } else if (providers.speech.info.mode !== "mock") {
    throw new ProviderError("오디오 없는 나레이션 결과", { provider: providers.speech.name, retryable: true });
  }
  return { sceneResult: { asset, durationMs: speech.durationMs, captions, inputKey: inputKeyOf(job) } };
}

// ---------------------------------------------------------------------------
// 핸들러: 최종 MP4 렌더 → Storage
// ---------------------------------------------------------------------------
async function runRenderJob({ deps, job, project }: Ctx) {
  const { db } = deps;
  if (!deps.renderer) throw new ProviderError("렌더러가 구성되지 않았습니다", { provider: "remotion", retryable: false });
  const render = await currentRender(db, job.project_id);
  if (!render) throw new ProviderError("현재 렌더 레코드 없음", { provider: "db", retryable: false });

  const plan = render.input_props as unknown as CompositionPlan;
  // 렌더러(Chromium)가 비공개 버킷 파일을 읽도록 렌더 시간보다 넉넉한 서명 URL
  const signed = await signMedia(db, planStoragePaths(plan), 2 * 3600);
  const props = resolveCompositionPlan(plan, signed);

  await db.from("renders").update({ status: "running" }).eq("id", render.id);
  const out = await deps.renderer(props);
  const uploaded = await uploadMedia(db, mediaPath(project.user_id, project.id, "render", render.id, "mp4"), out.data, out.mimeType);
  return {
    ops: [
      {
        op: "complete_render",
        renderId: render.id,
        asset: { ...uploaded, durationMs: out.durationMs, provider: "remotion", inputKey: render.composition_hash },
      } as DbOp,
    ],
  };
}
