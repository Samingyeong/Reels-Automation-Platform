import "server-only";
import { z } from "zod";
import { isWorkerOnlyEvent, transition, type JobKind, type PipelineEvent, type PipelineEventType, type ProjectStatus } from "../domain/pipeline";
import { EditableScript, ProjectOptions, ScriptInput } from "../domain/schemas";
import type { Providers } from "../providers/types";
import {
  buildCompositionPlan,
  buildScenesSnapshot,
  buildScriptSnapshot,
  compositionPlanHash,
  planStoragePaths,
  resolveCompositionPlan,
  scriptContentHash,
  type ScriptSnapshot,
} from "./content";
import type { Database } from "./database.types";
import { contentHash } from "../domain/hash";
import { fromDbError, ServiceError } from "./errors";
import type { JobDispatcher } from "./jobs/dispatcher";
import { effectsToOps, type DbOp } from "./ops";
import { MEDIA_BUCKET } from "./storage";
import type { Db } from "./supabase";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type SceneRow = Database["public"]["Tables"]["scenes"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

export type ServiceDeps = {
  /** service_role 클라이언트 (쓰기·RPC). 사용 전 반드시 소유권 확인. */
  admin: Db;
  dispatcher: JobDispatcher;
  providers: Providers;
};

const DEFAULT_VOICE = "default";

// ---------------------------------------------------------------------------
// 조회 (사용자 클라이언트 → RLS 로 본인 데이터만)
// ---------------------------------------------------------------------------
export async function listProjects(userDb: Db) {
  const { data, error } = await userDb
    .from("projects")
    .select("id, title, topic, status, revision, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw fromDbError(error);
  return data;
}

export async function getProjectDetail(userDb: Db, projectId: string) {
  if (!z.string().uuid().safeParse(projectId).success) throw new ServiceError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  const { data: project, error } = await userDb.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!project) throw new ServiceError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  const [scenes, approvals, jobs, renders] = await Promise.all([
    userDb.from("scenes").select("*").eq("project_id", projectId).order("position"),
    userDb
      .from("approvals")
      .select("id, stage, version, content_hash, approved_at, revoked_at, revoked_reason")
      .eq("project_id", projectId)
      .order("version", { ascending: false }),
    userDb
      .from("jobs")
      .select("id, kind, scene_id, status, attempt, max_attempts, error, created_at, finished_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50),
    userDb.from("renders").select("id, status, error, asset_id, created_at").eq("project_id", projectId).eq("is_current", true),
  ]);
  for (const r of [scenes, approvals, jobs, renders]) if (r.error) throw fromDbError(r.error);
  const sceneRows = scenes.data ?? [];
  const render = renders.data?.[0] ?? null;

  const assets = await loadAssets(userDb, [
    ...sceneRows.flatMap((s) => [s.visual_asset_id, s.narration_asset_id]),
    render?.asset_id ?? null,
  ]);
  const allNarrationReady = sceneRows.length > 0 && sceneRows.every((s) => s.narration_status === "ready");
  const plan = allNarrationReady ? buildCompositionPlan(sceneRows, assets) : null;
  const renderAsset = render?.asset_id ? assets.get(render.asset_id) : undefined;

  // 미리보기용 서명 URL (사용자 클라이언트 → Storage RLS 로 본인 파일만 서명 가능). 다운로드 UI 는 제공하지 않는다.
  const assetPath = (id: string | null) => (id ? assets.get(id)?.storage_path : undefined);
  const paths = [
    ...sceneRows.flatMap((s) => [assetPath(s.narration_asset_id), assetPath(s.visual_asset_id)].filter((p): p is string => !!p)),
    ...(plan ? planStoragePaths(plan) : []),
    ...(renderAsset ? [renderAsset.storage_path] : []),
  ];
  const signed = await signForUser(userDb, paths);

  return {
    project,
    scenes: sceneRows.map((s) => {
      const audio = assetPath(s.narration_asset_id);
      const visual = s.visual_asset_id ? assets.get(s.visual_asset_id) : undefined;
      return {
        ...s,
        narration_audio_url: audio ? (signed.get(audio) ?? null) : null,
        visual_url: visual ? (signed.get(visual.storage_path) ?? null) : null,
        visual_mime: visual?.mime_type ?? null,
      };
    }),
    approvals: approvals.data ?? [],
    activeApprovals: (approvals.data ?? []).filter((a) => a.revoked_at === null),
    jobs: jobs.data ?? [],
    contentHashes: {
      script: scriptContentHash(buildScriptSnapshot(project, sceneRows)),
      scenes: contentHash(buildScenesSnapshot(sceneRows)),
      final: plan ? compositionPlanHash(plan) : null,
    },
    preview: plan ? resolveCompositionPlan(plan, signed) : null,
    render: render
      ? {
          id: render.id,
          status: render.status,
          error: render.error,
          videoUrl: renderAsset ? (signed.get(renderAsset.storage_path) ?? null) : null,
          sizeBytes: renderAsset?.size_bytes ?? null,
          durationMs: renderAsset?.duration_ms ?? null,
        }
      : null,
  };
}

async function loadAssets(db: Db, ids: (string | null)[]): Promise<Map<string, AssetRow>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.from("assets").select("*").in("id", unique);
  if (error) throw fromDbError(error);
  return new Map((data ?? []).map((a) => [a.id, a]));
}

async function signForUser(userDb: Db, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await userDb.storage.from(MEDIA_BUCKET).createSignedUrls(unique, 3600);
  if (error) throw new ServiceError("INTERNAL", "미디어 URL 발급에 실패했습니다.");
  for (const item of data ?? []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  return map;
}

// ---------------------------------------------------------------------------
// 명령
// ---------------------------------------------------------------------------
export async function createProject(deps: ServiceDeps, userId: string, input: unknown) {
  const parsed = parseOr400(ScriptInput, input);
  const { topic, ...rest } = parsed;
  const options = ProjectOptions.parse(rest);
  const { data, error } = await deps.admin
    .from("projects")
    .insert({ user_id: userId, topic, title: topic.slice(0, 120), options })
    .select("id, status, revision")
    .single();
  if (error) throw fromDbError(error);
  return data;
}

const RevisionBody = z.object({ revision: z.number().int().nonnegative() });

export async function requestScriptGeneration(deps: ServiceDeps, userId: string, projectId: string, body: unknown) {
  const { revision } = parseOr400(RevisionBody, body);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "GENERATE_SCRIPT" });
}

const EditScriptBody = z.object({ revision: z.number().int().nonnegative(), script: EditableScript });

export async function editScript(deps: ServiceDeps, userId: string, projectId: string, body: unknown) {
  const { revision, script } = parseOr400(EditScriptBody, body);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "EDIT_SCRIPT" }, {
    contentOps: [{ op: "replace_script", script }],
  });
}

const ApproveBody = z.object({ revision: z.number().int().nonnegative(), contentHash: z.string().length(64) });

export async function approveScript(deps: ServiceDeps, userId: string, projectId: string, body: unknown) {
  const { revision, contentHash } = parseOr400(ApproveBody, body);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "APPROVE_SCRIPT" }, {
    approval: (project, scenes) => {
      if (scenes.length === 0) throw new ServiceError("PRECONDITION_FAILED", "승인할 장면이 없습니다.");
      const snapshot: ScriptSnapshot = buildScriptSnapshot(project, scenes);
      const current = scriptContentHash(snapshot);
      if (current !== contentHash) {
        throw new ServiceError("CONTENT_CHANGED", "검토한 내용 이후 대본이 변경되었습니다. 다시 확인 후 승인하세요.", {
          currentHash: current,
        });
      }
      return { contentHash: current, snapshot };
    },
  });
}

export async function retryFailedStep(deps: ServiceDeps, userId: string, projectId: string, body: unknown) {
  const { revision } = parseOr400(RevisionBody, body);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "RETRY" });
}

export async function approveScenes(deps: ServiceDeps, userId: string, projectId: string, body: unknown) {
  const { revision, contentHash: expected } = parseOr400(ApproveBody, body);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "APPROVE_SCENES" }, {
    approval: (_project, scenes) => {
      if (scenes.length === 0 || scenes.some((s) => s.visual_status !== "ready")) {
        throw new ServiceError("PRECONDITION_FAILED", "모든 장면 영상이 준비되어야 승인할 수 있습니다.");
      }
      const snapshot = buildScenesSnapshot(scenes);
      return checkHash(contentHash(snapshot), expected, snapshot);
    },
  });
}

export async function approveFinal(deps: ServiceDeps, userId: string, projectId: string, body: unknown) {
  const { revision, contentHash: expected } = parseOr400(ApproveBody, body);
  const { scenes } = await loadOwnedProject(deps.admin, userId, projectId);
  if (scenes.length === 0 || scenes.some((s) => s.narration_status !== "ready" || s.visual_status !== "ready")) {
    throw new ServiceError("PRECONDITION_FAILED", "모든 장면의 영상·나레이션이 준비되어야 승인할 수 있습니다.");
  }
  const plan = buildCompositionPlan(scenes, await loadAssets(deps.admin, scenes.flatMap((s) => [s.visual_asset_id, s.narration_asset_id])));
  const hash = compositionPlanHash(plan);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "APPROVE_FINAL" }, {
    // 승인한 컴포지션 그대로 렌더한다: 렌더 레코드에 계획 스냅샷·해시를 같은 트랜잭션에서 고정
    contentOps: [{ op: "invalidate_render" }, { op: "create_render", compositionHash: hash, inputProps: plan }],
    approval: () => checkHash(hash, expected, plan),
  });
}

const SceneEditBody = z.object({
  revision: z.number().int().nonnegative(),
  visualPrompt: z.string().trim().min(1).max(600).optional(),
  durationSec: z.number().min(1).max(30).optional(),
});

/**
 * 장면 하나만 (수정 후) 다시 생성.
 *  - 장면 검수 단계에서 수정 없이 재생성: REGENERATE_SCENES
 *  - 프롬프트·길이 수정, 또는 장면 승인 이후 단계에서 요청: EDIT_SCENE(후속 승인 초기화) → REGENERATE_SCENES
 */
export async function regenerateScene(deps: ServiceDeps, userId: string, projectId: string, sceneId: string, body: unknown) {
  const { revision, visualPrompt, durationSec } = parseOr400(SceneEditBody, body);
  const { project, scenes } = await loadOwnedProject(deps.admin, userId, projectId);
  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) throw new ServiceError("NOT_FOUND", "장면을 찾을 수 없습니다.");
  const changed =
    (visualPrompt !== undefined && visualPrompt !== scene.visual_prompt) ||
    (durationSec !== undefined && durationSec !== Number(scene.duration_sec));
  let rev = revision;
  if (changed || !(project.status === "SCENES_REVIEW" || project.status === "SCENES_FAILED")) {
    const edited = await dispatchUserEvent(deps, userId, projectId, rev, { type: "EDIT_SCENE", sceneId }, {
      contentOps: changed ? [{ op: "update_scene", sceneId, visualPrompt, durationSec }] : [],
    });
    rev = edited.revision;
  }
  return dispatchUserEvent(deps, userId, projectId, rev, { type: "REGENERATE_SCENES", sceneIds: [sceneId] });
}

const NarrationBody = z.object({
  revision: z.number().int().nonnegative(),
  narration: z.string().trim().min(1).max(400).optional(),
});

/** 장면 하나의 나레이션(문구 수정 포함) 재생성 → 최종 승인 초기화, 해당 장면만 TTS·자막 재생성 */
export async function regenerateNarration(deps: ServiceDeps, userId: string, projectId: string, sceneId: string, body: unknown) {
  const { revision, narration } = parseOr400(NarrationBody, body);
  return dispatchUserEvent(deps, userId, projectId, revision, { type: "REGENERATE_NARRATION", sceneIds: [sceneId] }, {
    contentOps: narration ? [{ op: "update_scene", sceneId, narration }] : [],
    sceneMustExist: sceneId,
  });
}

function checkHash(current: string, expected: string, snapshot: unknown) {
  if (current !== expected) {
    throw new ServiceError("CONTENT_CHANGED", "검토한 내용 이후 변경되었습니다. 다시 확인 후 승인하세요.", { currentHash: current });
  }
  return { contentHash: current, snapshot };
}

/** 생성 단계로 들어가는데 생성할 대상이 없으면(모두 재사용) 바로 다음 검수 단계로 넘긴다 */
const SETTLE_IF_EMPTY: Partial<Record<ProjectStatus, { kind: JobKind; event: PipelineEventType }>> = {
  SCENES_GENERATING: { kind: "scene_video", event: "SCENES_SUCCEEDED" },
  NARRATION_GENERATING: { kind: "narration", event: "NARRATION_SUCCEEDED" },
};

// ---------------------------------------------------------------------------
// 핵심: 사용자 이벤트 처리
//   1) 소유권 확인  2) 도메인 전이 판단  3) 단일 트랜잭션(apply_transition)  4) 커밋 후 outbox 전달
// ---------------------------------------------------------------------------
type DispatchOptions = {
  contentOps?: DbOp[];
  sceneMustExist?: string;
  approval?: (project: ProjectRow, scenes: SceneRow[]) => { contentHash: string; snapshot: unknown };
};

export async function dispatchUserEvent(
  deps: ServiceDeps,
  userId: string,
  projectId: string,
  expectedRevision: number,
  event: PipelineEvent,
  opts: DispatchOptions = {},
) {
  if (isWorkerOnlyEvent(event.type)) {
    throw new ServiceError("INVALID_TRANSITION", "사용자가 보낼 수 없는 이벤트입니다.");
  }
  const { project, scenes } = await loadOwnedProject(deps.admin, userId, projectId);
  if (project.revision !== expectedRevision) {
    throw new ServiceError("REVISION_CONFLICT", "다른 변경이 먼저 반영되었습니다. 새로고침 후 다시 시도하세요.", {
      currentRevision: project.revision,
    });
  }

  if (opts.sceneMustExist && !scenes.some((s) => s.id === opts.sceneMustExist)) {
    throw new ServiceError("NOT_FOUND", "장면을 찾을 수 없습니다.");
  }

  const result = transition(project.status, event);
  if (!result.ok) throw new ServiceError("INVALID_TRANSITION", result.reason);

  const options = ProjectOptions.safeParse(project.options ?? {});
  const ops: DbOp[] = [
    ...(opts.contentOps ?? []),
    ...effectsToOps(result.effects, {
      projectId,
      nextRevision: expectedRevision + 1,
      scenes: scenes.map((s) => ({
        id: s.id,
        visualPrompt: s.visual_prompt,
        durationSec: Number(s.duration_sec),
        narration: s.narration,
        visualStatus: s.visual_status,
        narrationStatus: s.narration_status,
      })),
      providerNames: {
        script: deps.providers.script.name,
        sceneVideo: deps.providers.sceneVideo.name,
        speech: deps.providers.speech.name,
      },
      voiceId: DEFAULT_VOICE,
      language: options.success ? options.data.language : "ko",
      approval: opts.approval?.(project, scenes),
    }),
  ];

  let toStatus = result.to;
  let eventName: string = event.type;
  const settle = SETTLE_IF_EMPTY[result.to];
  if (settle && !ops.some((o) => o.op === "enqueue" && o.kind === settle.kind)) {
    const next = transition(result.to, { type: settle.event } as PipelineEvent);
    if (next.ok) {
      toStatus = next.to;
      eventName = `${event.type}+${settle.event}(reused)`;
    }
  }

  const { data, error } = await deps.admin.rpc("apply_transition", {
    p_project_id: projectId,
    p_actor_user_id: userId,
    p_actor: `user:${userId}`,
    p_event: eventName,
    p_expected_status: project.status,
    p_expected_revision: expectedRevision,
    p_to_status: toStatus,
    p_ops: ops as never,
  });
  if (error) throw fromDbError(error);

  const applied = data as { revision: number; status: ProjectRow["status"]; jobIds: string[] };
  // 커밋 이후 전달. 실패해도 jobs 가 queued 로 남아 스윕이 재전달하므로 요청은 성공으로 응답한다.
  try {
    await deps.dispatcher.dispatch(applied.jobIds);
  } catch (err) {
    console.error("[jobs] dispatch after commit failed; outbox sweep will retry", err);
  }
  return { id: projectId, status: applied.status, revision: applied.revision, jobIds: applied.jobIds };
}

async function loadOwnedProject(admin: Db, userId: string, projectId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    throw new ServiceError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }
  const { data: project, error } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!project) throw new ServiceError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  const { data: scenes, error: sErr } = await admin
    .from("scenes")
    .select("*")
    .eq("project_id", projectId)
    .order("position");
  if (sErr) throw fromDbError(sErr);
  return { project, scenes: scenes ?? [] };
}

function parseOr400<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ServiceError("VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.", r.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })));
  }
  return r.data;
}
