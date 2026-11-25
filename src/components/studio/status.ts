import type { ProjectStatus } from "@/domain/pipeline";

export type StageKey = "script" | "scenes" | "voice" | "render";

export const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: "script", label: "대본", hint: "주제 → 장면별 대본" },
  { key: "scenes", label: "장면 영상", hint: "장면마다 영상 생성" },
  { key: "voice", label: "나레이션·자막", hint: "음성·자막 입히고 최종 미리보기" },
  { key: "render", label: "MP4 렌더", hint: "승인한 그대로 렌더" },
];

const STAGE_OF: Record<ProjectStatus, StageKey> = {
  DRAFT: "script",
  SCRIPT_GENERATING: "script",
  SCRIPT_FAILED: "script",
  SCRIPT_REVIEW: "script",
  SCENES_GENERATING: "scenes",
  SCENES_FAILED: "scenes",
  SCENES_REVIEW: "scenes",
  NARRATION_GENERATING: "voice",
  NARRATION_FAILED: "voice",
  FINAL_REVIEW: "voice",
  RENDERING: "render",
  RENDER_FAILED: "render",
  RENDERED: "render",
  SCHEDULED: "render",
  PUBLISHING: "render",
  PUBLISH_FAILED: "render",
  PUBLISHED: "render",
};

export const stageOf = (s: ProjectStatus) => STAGE_OF[s];
export const stageIndex = (k: StageKey) => STAGES.findIndex((s) => s.key === k);

export const isBusy = (s: ProjectStatus) => s.endsWith("_GENERATING") || s === "RENDERING" || s === "PUBLISHING";
export const isFailed = (s: ProjectStatus) => s.endsWith("_FAILED");

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "시작 전",
  SCRIPT_GENERATING: "대본 작성 중",
  SCRIPT_FAILED: "대본 생성 실패",
  SCRIPT_REVIEW: "대본 검수",
  SCENES_GENERATING: "장면 생성 중",
  SCENES_FAILED: "장면 생성 실패",
  SCENES_REVIEW: "장면 검수",
  NARRATION_GENERATING: "나레이션 생성 중",
  NARRATION_FAILED: "나레이션 생성 실패",
  FINAL_REVIEW: "최종 미리보기",
  RENDERING: "렌더링 중",
  RENDER_FAILED: "렌더 실패",
  RENDERED: "렌더 완료",
  SCHEDULED: "예약됨",
  PUBLISHING: "발행 중",
  PUBLISH_FAILED: "발행 실패",
  PUBLISHED: "발행 완료",
};

export function statusTone(s: ProjectStatus): "busy" | "review" | "done" | "failed" | "idle" {
  if (isFailed(s)) return "failed";
  if (isBusy(s)) return "busy";
  if (s === "RENDERED" || s === "PUBLISHED") return "done";
  if (s === "DRAFT") return "idle";
  return "review";
}
