/**
 * 도메인 SideEffect → apply_transition RPC 의 op 목록 변환 (순수 함수).
 * RPC 는 이 op 들을 한 트랜잭션에서 실행한다 (supabase/migrations/*_m1_*.sql).
 */
import { jobInputKey } from "../domain/hash";
import type { ApprovalStage, JobKind, SideEffect } from "../domain/pipeline";
import { VIDEO_HEIGHT, VIDEO_WIDTH, type EditableScript, type Script } from "../domain/schemas";

export type DbOp =
  | { op: "replace_script"; script: Script | EditableScript }
  | { op: "revoke_approvals"; stages: ApprovalStage[]; reason?: string }
  | { op: "record_approval"; stage: ApprovalStage; contentHash: string; snapshot: unknown }
  | { op: "mark_scenes_stale"; sceneIds: string[]; part: "visual" | "narration" }
  | { op: "invalidate_render" }
  | { op: "cancel_scheduled_publication" }
  | {
      op: "enqueue";
      kind: JobKind;
      idempotencyKey: string;
      sceneId?: string;
      payload?: Record<string, unknown>;
      provider?: string;
      maxAttempts?: number;
    }
  | { op: "complete_job"; jobId: string; result: unknown }
  | { op: "fail_job"; jobId: string; error: string; retryable: boolean };

export type SceneForEnqueue = {
  id: string;
  visualPrompt: string;
  durationSec: number;
  narration: string;
  visualStatus: string;
  narrationStatus: string;
};

export type OpsContext = {
  projectId: string;
  /** 전이 후 revision (= expectedRevision + 1). 재생성 요청마다 다른 멱등 키를 만든다. */
  nextRevision: number;
  scenes: SceneForEnqueue[];
  providerNames: { script: string; sceneVideo: string; speech: string };
  voiceId: string;
  language: string;
  /** RECORD_APPROVAL 에 필요한 승인 대상 스냅샷·해시 (승인 요청에서만) */
  approval?: { contentHash: string; snapshot: unknown };
};

export function effectsToOps(effects: SideEffect[], ctx: OpsContext): DbOp[] {
  const ops: DbOp[] = [];
  for (const e of effects) {
    switch (e.type) {
      case "REVOKE_APPROVALS":
        ops.push({ op: "revoke_approvals", stages: e.stages });
        break;
      case "RECORD_APPROVAL":
        if (!ctx.approval) throw new Error(`RECORD_APPROVAL(${e.stage}) 에 승인 스냅샷이 없습니다.`);
        ops.push({ op: "record_approval", stage: e.stage, ...ctx.approval });
        break;
      case "MARK_SCENES_STALE":
        ops.push({ op: "mark_scenes_stale", sceneIds: e.sceneIds, part: e.part });
        break;
      case "INVALIDATE_RENDER":
        ops.push({ op: "invalidate_render" });
        break;
      case "CANCEL_SCHEDULED_PUBLICATION":
        ops.push({ op: "cancel_scheduled_publication" });
        break;
      case "ENQUEUE":
        ops.push(...enqueueOps(e.job, e.sceneIds, ctx));
        break;
      default: {
        const never: never = e;
        throw new Error(`처리되지 않은 SideEffect: ${JSON.stringify(never)}`);
      }
    }
  }
  return ops;
}

function enqueueOps(kind: JobKind, sceneIds: string[] | undefined, ctx: OpsContext): DbOp[] {
  switch (kind) {
    case "script":
      // 사용자가 다시 생성을 요청할 때마다 새 결과가 필요하므로 revision 기반 키
      return [
        {
          op: "enqueue",
          kind,
          idempotencyKey: `script:${ctx.projectId}:r${ctx.nextRevision}`,
          provider: ctx.providerNames.script,
        },
      ];
    case "scene_video": {
      // 장면 입력 해시 기반 키 → 같은 입력은 이미 성공한 작업이 있으면 다시 만들지 않는다 (비용 중복 방지)
      const targets = selectScenes(ctx.scenes, sceneIds, (s) => s.visualStatus);
      return targets.map((s) => ({
        op: "enqueue" as const,
        kind,
        sceneId: s.id,
        provider: ctx.providerNames.sceneVideo,
        payload: { sceneId: s.id },
        idempotencyKey: `${jobInputKey("scene_video", ctx.providerNames.sceneVideo, {
          prompt: s.visualPrompt,
          durationSec: s.durationSec,
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
        })}:${s.id}`,
      }));
    }
    case "narration": {
      const targets = selectScenes(ctx.scenes, sceneIds, (s) => s.narrationStatus);
      return targets.map((s) => ({
        op: "enqueue" as const,
        kind,
        sceneId: s.id,
        provider: ctx.providerNames.speech,
        payload: { sceneId: s.id },
        idempotencyKey: `${jobInputKey("narration", ctx.providerNames.speech, {
          text: s.narration,
          voiceId: ctx.voiceId,
          language: ctx.language,
        })}:${s.id}`,
      }));
    }
    case "render":
    case "publish":
    case "insights":
      return [{ op: "enqueue", kind, idempotencyKey: `${kind}:${ctx.projectId}:r${ctx.nextRevision}` }];
  }
}

/** 명시된 장면이 있으면 그것만, 없으면 아직 ready 가 아닌 장면만 대상으로 한다. */
function selectScenes(
  scenes: SceneForEnqueue[],
  sceneIds: string[] | undefined,
  status: (s: SceneForEnqueue) => string,
): SceneForEnqueue[] {
  if (sceneIds && sceneIds.length > 0) {
    const set = new Set(sceneIds);
    return scenes.filter((s) => set.has(s.id));
  }
  return scenes.filter((s) => status(s) !== "ready");
}
