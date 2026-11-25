/**
 * 프로젝트 제작 파이프라인 상태 머신 (공통 계약).
 *
 * - 순수 함수만 둔다. DB/네트워크 접근 금지 → 서버, 워커, 테스트에서 동일하게 사용.
 * - 사용자 승인 이벤트(APPROVE_*) 없이는 다음 제작 단계로 진행할 수 없다.
 * - 수정 이벤트(EDIT_*)는 관련된 후속 승인을 초기화한다 (`invalidatedApprovals`).
 * - 성공 상태는 워커가 보고한 *_SUCCEEDED 이벤트로만 도달한다. UI가 임의로 성공을 만들 수 없다.
 *
 * 상세 설명: docs/03-state-machine.md
 */

export const PROJECT_STATUSES = [
  "DRAFT",
  "SCRIPT_GENERATING",
  "SCRIPT_FAILED",
  "SCRIPT_REVIEW",
  "SCENES_GENERATING",
  "SCENES_FAILED",
  "SCENES_REVIEW",
  "NARRATION_GENERATING",
  "NARRATION_FAILED",
  "FINAL_REVIEW",
  "RENDERING",
  "RENDER_FAILED",
  "RENDERED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISH_FAILED",
  "PUBLISHED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** 사용자 승인이 필요한 게이트. 순서가 곧 의존 순서다. */
export const APPROVAL_STAGES = ["script", "scenes", "final"] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export type PipelineEvent =
  // 사용자 이벤트
  | { type: "GENERATE_SCRIPT" }
  | { type: "EDIT_SCRIPT" }
  | { type: "APPROVE_SCRIPT" }
  | { type: "EDIT_SCENE"; sceneId: string }
  | { type: "REGENERATE_SCENES"; sceneIds: string[] }
  | { type: "APPROVE_SCENES" }
  | { type: "EDIT_CAPTIONS" }
  | { type: "REGENERATE_NARRATION"; sceneIds: string[] }
  | { type: "APPROVE_FINAL" }
  | { type: "RETRY" }
  | { type: "SCHEDULE" }
  | { type: "CANCEL_SCHEDULE" }
  // 워커 이벤트
  | { type: "SCRIPT_SUCCEEDED" }
  | { type: "SCRIPT_FAILED" }
  | { type: "SCENES_SUCCEEDED" }
  | { type: "SCENES_FAILED" }
  | { type: "NARRATION_SUCCEEDED" }
  | { type: "NARRATION_FAILED" }
  | { type: "RENDER_SUCCEEDED" }
  | { type: "RENDER_FAILED" }
  | { type: "PUBLISH_STARTED" }
  | { type: "PUBLISH_SUCCEEDED" }
  | { type: "PUBLISH_FAILED" };

export type PipelineEventType = PipelineEvent["type"];

/** 상태 전이 결과에 따라 서버가 수행해야 할 부수 효과. 실행은 서버/워커 책임. */
export type SideEffect =
  | { type: "ENQUEUE"; job: JobKind; sceneIds?: string[] }
  | { type: "REVOKE_APPROVALS"; stages: ApprovalStage[] }
  | { type: "RECORD_APPROVAL"; stage: ApprovalStage }
  | { type: "MARK_SCENES_STALE"; sceneIds: string[]; part: "visual" | "narration" }
  | { type: "INVALIDATE_RENDER" }
  | { type: "CANCEL_SCHEDULED_PUBLICATION" };

export const JOB_KINDS = [
  "script",
  "scene_video",
  "narration",
  "render",
  "publish",
  "insights",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type TransitionResult =
  | { ok: true; to: ProjectStatus; effects: SideEffect[] }
  | { ok: false; reason: string };

/** 상태별로 콘텐츠(대본/장면/자막) 수정이 가능한지. 생성·렌더·발행 진행 중에는 잠근다. */
const EDITABLE: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>([
  "SCRIPT_REVIEW",
  "SCRIPT_FAILED",
  "SCENES_REVIEW",
  "SCENES_FAILED",
  "NARRATION_FAILED",
  "FINAL_REVIEW",
  "RENDER_FAILED",
  "RENDERED",
  "SCHEDULED",
]);

const AFTER_SCENES_GATE: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>([
  "NARRATION_FAILED",
  "FINAL_REVIEW",
  "RENDER_FAILED",
  "RENDERED",
  "SCHEDULED",
]);

/** 특정 승인 단계가 변경될 때 함께 초기화되어야 하는 단계 (자기 자신 포함). */
export function invalidatedApprovals(stage: ApprovalStage): ApprovalStage[] {
  const idx = APPROVAL_STAGES.indexOf(stage);
  return APPROVAL_STAGES.slice(idx);
}

/** 수정으로 인해 이미 만들어진 렌더/예약이 무효가 되는 공통 효과. */
function downstreamOutputEffects(from: ProjectStatus): SideEffect[] {
  const effects: SideEffect[] = [];
  if (from === "RENDERED" || from === "SCHEDULED" || from === "RENDER_FAILED") {
    effects.push({ type: "INVALIDATE_RENDER" });
  }
  if (from === "SCHEDULED") effects.push({ type: "CANCEL_SCHEDULED_PUBLICATION" });
  return effects;
}

const ok = (to: ProjectStatus, effects: SideEffect[] = []): TransitionResult => ({
  ok: true,
  to,
  effects,
});
const deny = (from: ProjectStatus, event: PipelineEventType): TransitionResult => ({
  ok: false,
  reason: `이벤트 ${event} 는 상태 ${from} 에서 허용되지 않습니다.`,
});

/**
 * 상태 전이 함수. 허용되지 않은 전이는 `{ ok: false }` 를 반환하며 서버는 409로 응답한다.
 */
export function transition(from: ProjectStatus, event: PipelineEvent): TransitionResult {
  switch (event.type) {
    // ---------- 1. 대본 ----------
    case "GENERATE_SCRIPT":
      return from === "DRAFT" || from === "SCRIPT_FAILED" || from === "SCRIPT_REVIEW"
        ? ok("SCRIPT_GENERATING", [
            { type: "REVOKE_APPROVALS", stages: invalidatedApprovals("script") },
            ...downstreamOutputEffects(from),
            { type: "ENQUEUE", job: "script" },
          ])
        : deny(from, event.type);
    case "SCRIPT_SUCCEEDED":
      return from === "SCRIPT_GENERATING" ? ok("SCRIPT_REVIEW") : deny(from, event.type);
    case "SCRIPT_FAILED":
      return from === "SCRIPT_GENERATING" ? ok("SCRIPT_FAILED") : deny(from, event.type);
    case "EDIT_SCRIPT":
      return EDITABLE.has(from) && from !== "SCRIPT_FAILED"
        ? ok("SCRIPT_REVIEW", [
            { type: "REVOKE_APPROVALS", stages: invalidatedApprovals("script") },
            ...downstreamOutputEffects(from),
          ])
        : deny(from, event.type);
    case "APPROVE_SCRIPT":
      return from === "SCRIPT_REVIEW"
        ? ok("SCENES_GENERATING", [
            { type: "RECORD_APPROVAL", stage: "script" },
            { type: "ENQUEUE", job: "scene_video" },
          ])
        : deny(from, event.type);

    // ---------- 2. 장면 영상 ----------
    case "SCENES_SUCCEEDED":
      return from === "SCENES_GENERATING" ? ok("SCENES_REVIEW") : deny(from, event.type);
    case "SCENES_FAILED":
      return from === "SCENES_GENERATING" ? ok("SCENES_FAILED") : deny(from, event.type);
    case "EDIT_SCENE":
      return from === "SCENES_REVIEW" || from === "SCENES_FAILED" || AFTER_SCENES_GATE.has(from)
        ? ok("SCENES_REVIEW", [
            { type: "REVOKE_APPROVALS", stages: invalidatedApprovals("scenes") },
            { type: "MARK_SCENES_STALE", sceneIds: [event.sceneId], part: "visual" },
            ...downstreamOutputEffects(from),
          ])
        : deny(from, event.type);
    case "REGENERATE_SCENES":
      if (event.sceneIds.length === 0) return { ok: false, reason: "재생성할 장면이 없습니다." };
      return from === "SCENES_REVIEW" || from === "SCENES_FAILED"
        ? ok("SCENES_GENERATING", [
            { type: "REVOKE_APPROVALS", stages: invalidatedApprovals("scenes") },
            { type: "ENQUEUE", job: "scene_video", sceneIds: event.sceneIds },
          ])
        : deny(from, event.type);
    case "APPROVE_SCENES":
      return from === "SCENES_REVIEW"
        ? ok("NARRATION_GENERATING", [
            { type: "RECORD_APPROVAL", stage: "scenes" },
            { type: "ENQUEUE", job: "narration" },
          ])
        : deny(from, event.type);

    // ---------- 3. 나레이션·자막 + 최종 미리보기 ----------
    case "NARRATION_SUCCEEDED":
      return from === "NARRATION_GENERATING" ? ok("FINAL_REVIEW") : deny(from, event.type);
    case "NARRATION_FAILED":
      return from === "NARRATION_GENERATING" ? ok("NARRATION_FAILED") : deny(from, event.type);
    case "REGENERATE_NARRATION":
      if (event.sceneIds.length === 0) return { ok: false, reason: "재생성할 장면이 없습니다." };
      return AFTER_SCENES_GATE.has(from)
        ? ok("NARRATION_GENERATING", [
            { type: "REVOKE_APPROVALS", stages: invalidatedApprovals("final") },
            { type: "MARK_SCENES_STALE", sceneIds: event.sceneIds, part: "narration" },
            ...downstreamOutputEffects(from),
            { type: "ENQUEUE", job: "narration", sceneIds: event.sceneIds },
          ])
        : deny(from, event.type);
    case "EDIT_CAPTIONS":
      return from === "FINAL_REVIEW" ||
        from === "RENDER_FAILED" ||
        from === "RENDERED" ||
        from === "SCHEDULED"
        ? ok("FINAL_REVIEW", [
            { type: "REVOKE_APPROVALS", stages: invalidatedApprovals("final") },
            ...downstreamOutputEffects(from),
          ])
        : deny(from, event.type);
    case "APPROVE_FINAL":
      return from === "FINAL_REVIEW"
        ? ok("RENDERING", [
            { type: "RECORD_APPROVAL", stage: "final" },
            { type: "ENQUEUE", job: "render" },
          ])
        : deny(from, event.type);

    // ---------- 4. 렌더링 ----------
    case "RENDER_SUCCEEDED":
      return from === "RENDERING" ? ok("RENDERED") : deny(from, event.type);
    case "RENDER_FAILED":
      return from === "RENDERING" ? ok("RENDER_FAILED") : deny(from, event.type);

    // ---------- 5. 예약 · 발행 ----------
    case "SCHEDULE":
      return from === "RENDERED" || from === "PUBLISH_FAILED"
        ? ok("SCHEDULED", [{ type: "ENQUEUE", job: "publish" }])
        : deny(from, event.type);
    case "CANCEL_SCHEDULE":
      return from === "SCHEDULED"
        ? ok("RENDERED", [{ type: "CANCEL_SCHEDULED_PUBLICATION" }])
        : deny(from, event.type);
    case "PUBLISH_STARTED":
      return from === "SCHEDULED" ? ok("PUBLISHING") : deny(from, event.type);
    case "PUBLISH_SUCCEEDED":
      return from === "PUBLISHING" ? ok("PUBLISHED") : deny(from, event.type);
    case "PUBLISH_FAILED":
      return from === "PUBLISHING" || from === "SCHEDULED"
        ? ok("PUBLISH_FAILED")
        : deny(from, event.type);

    // ---------- 실패 재시도 ----------
    case "RETRY":
      return retry(from);
  }
}

/** 실패 상태에서 같은 단계를 다시 실행한다. 이미 성공한 하위 작업은 input_hash 로 재사용한다. */
function retry(from: ProjectStatus): TransitionResult {
  switch (from) {
    case "SCRIPT_FAILED":
      return ok("SCRIPT_GENERATING", [{ type: "ENQUEUE", job: "script" }]);
    case "SCENES_FAILED":
      return ok("SCENES_GENERATING", [{ type: "ENQUEUE", job: "scene_video" }]);
    case "NARRATION_FAILED":
      return ok("NARRATION_GENERATING", [{ type: "ENQUEUE", job: "narration" }]);
    case "RENDER_FAILED":
      return ok("RENDERING", [{ type: "ENQUEUE", job: "render" }]);
    case "PUBLISH_FAILED":
      // 발행 재시도는 사용자가 다시 예약(SCHEDULE)하도록 강제한다 → 중복 게시 방지.
      return { ok: false, reason: "발행 실패는 상태 확인 후 다시 예약해야 합니다." };
    default:
      return deny(from, "RETRY");
  }
}

/** 승인 이벤트 → 승인 단계 매핑. */
export const APPROVAL_EVENT_STAGE = {
  APPROVE_SCRIPT: "script",
  APPROVE_SCENES: "scenes",
  APPROVE_FINAL: "final",
} as const satisfies Partial<Record<PipelineEventType, ApprovalStage>>;

/** 워커만 발생시킬 수 있는 이벤트. 사용자 API 에서 이 이벤트가 들어오면 거부해야 한다. */
export const WORKER_ONLY_EVENTS: ReadonlySet<PipelineEventType> = new Set<PipelineEventType>([
  "SCRIPT_SUCCEEDED",
  "SCRIPT_FAILED",
  "SCENES_SUCCEEDED",
  "SCENES_FAILED",
  "NARRATION_SUCCEEDED",
  "NARRATION_FAILED",
  "RENDER_SUCCEEDED",
  "RENDER_FAILED",
  "PUBLISH_STARTED",
  "PUBLISH_SUCCEEDED",
  "PUBLISH_FAILED",
]);

export function isWorkerOnlyEvent(type: PipelineEventType): boolean {
  return WORKER_ONLY_EVENTS.has(type);
}

/** 장면 단위 상태 → 프로젝트 단계 집계. 워커가 장면 작업 하나를 끝낼 때마다 호출한다. */
export type SceneJobStatus = "pending" | "generating" | "ready" | "failed" | "stale";

export function aggregateSceneStatuses(
  statuses: SceneJobStatus[],
): "in_progress" | "succeeded" | "failed" {
  if (statuses.length === 0) return "failed";
  if (statuses.some((s) => s === "generating" || s === "pending")) return "in_progress";
  if (statuses.every((s) => s === "ready")) return "succeeded";
  return "failed";
}
