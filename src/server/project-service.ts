import "server-only";
import { z } from "zod";
import { isWorkerOnlyEvent, transition, type PipelineEvent } from "../domain/pipeline";
import { EditableScript, ProjectOptions, ScriptInput } from "../domain/schemas";
import type { Providers } from "../providers/types";
import { buildScriptSnapshot, scriptContentHash, type ScriptSnapshot } from "./content";
import type { Database } from "./database.types";
import { fromDbError, ServiceError } from "./errors";
import type { JobDispatcher } from "./jobs/dispatcher";
import { effectsToOps, type DbOp } from "./ops";
import type { Db } from "./supabase";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type SceneRow = Database["public"]["Tables"]["scenes"]["Row"];

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
  const { data: project, error } = await userDb.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!project) throw new ServiceError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  const [scenes, approvals, jobs] = await Promise.all([
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
      .limit(20),
  ]);
  for (const r of [scenes, approvals, jobs]) if (r.error) throw fromDbError(r.error);
  const snapshot = buildScriptSnapshot(project, scenes.data ?? []);
  return {
    project,
    scenes: scenes.data ?? [],
    approvals: approvals.data ?? [],
    activeApprovals: (approvals.data ?? []).filter((a) => a.revoked_at === null),
    jobs: jobs.data ?? [],
    contentHashes: { script: scriptContentHash(snapshot) },
  };
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

// ---------------------------------------------------------------------------
// 핵심: 사용자 이벤트 처리
//   1) 소유권 확인  2) 도메인 전이 판단  3) 단일 트랜잭션(apply_transition)  4) 커밋 후 outbox 전달
// ---------------------------------------------------------------------------
type DispatchOptions = {
  contentOps?: DbOp[];
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

  const { data, error } = await deps.admin.rpc("apply_transition", {
    p_project_id: projectId,
    p_actor_user_id: userId,
    p_actor: `user:${userId}`,
    p_event: event.type,
    p_expected_status: project.status,
    p_expected_revision: expectedRevision,
    p_to_status: result.to,
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
