/**
 * 도메인 데이터 계약 (Zod). 클라이언트·서버·워커·Remotion 컴포지션이 공유한다.
 * 이 파일의 변경은 공통 계약 변경이다 → docs/06-work-plan.md 의 "계약 변경 절차"를 따른다.
 */
import { z } from "zod";

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
export const REEL_COMPOSITION_ID = "Reel";

/** Instagram Reels 권장 범위 안에서 MVP가 허용하는 길이 (초). */
export const MIN_TOTAL_SEC = 5;
export const MAX_TOTAL_SEC = 90;

export const ScriptInput = z.object({
  topic: z.string().trim().min(2).max(500),
  tone: z.string().trim().max(100).optional(),
  targetDurationSec: z.number().int().min(MIN_TOTAL_SEC).max(MAX_TOTAL_SEC).default(30),
  language: z.string().default("ko"),
});
export type ScriptInput = z.infer<typeof ScriptInput>;

/** LLM 이 반환해야 하는 장면 단위 대본. */
export const ScriptScene = z.object({
  narration: z.string().trim().min(1).max(400),
  visualPrompt: z.string().trim().min(1).max(600),
  durationSec: z.number().min(1).max(30),
});
export type ScriptScene = z.infer<typeof ScriptScene>;

export const Script = z.object({
  title: z.string().trim().min(1).max(120),
  hook: z.string().trim().max(200).optional(),
  scenes: z.array(ScriptScene).min(1).max(20),
  caption: z.string().max(2200).default(""),
  hashtags: z.array(z.string().regex(/^#?[\p{L}\p{N}_]+$/u)).max(30).default([]),
});
export type Script = z.infer<typeof Script>;

/**
 * 사용자가 편집해 저장하는 대본. 기존 장면은 id 를 유지해야 변경 여부(stale) 판단과
 * 결과물 재사용이 가능하다. id 가 없는 장면은 새 장면으로 추가된다.
 */
export const EditableScript = Script.extend({
  scenes: z.array(ScriptScene.extend({ id: z.string().uuid().optional() })).min(1).max(20),
});
export type EditableScript = z.infer<typeof EditableScript>;

/** 프로젝트 생성 시 저장되는 생성 옵션 (topic 제외) */
export const ProjectOptions = ScriptInput.omit({ topic: true });
export type ProjectOptions = z.infer<typeof ProjectOptions>;

/** @remotion/captions 의 Caption 타입과 동일한 형태. */
export const Caption = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
});
export type Caption = z.infer<typeof Caption>;

/** 장면 영상 소스. Mock 은 파일 없이 Remotion 이 그리는 placeholder 를 사용한다. */
export const SceneVisual = z.discriminatedUnion("type", [
  z.object({ type: z.literal("video"), src: z.string().url() }),
  z.object({ type: z.literal("image"), src: z.string().url() }),
  z.object({
    type: z.literal("placeholder"),
    color: z.string(),
    label: z.string(),
  }),
]);
export type SceneVisual = z.infer<typeof SceneVisual>;

export const ReelScene = z.object({
  id: z.string(),
  durationInFrames: z.number().int().positive(),
  visual: SceneVisual,
  audioSrc: z.string().url().nullable(),
  captions: z.array(Caption),
});
export type ReelScene = z.infer<typeof ReelScene>;

/** Remotion 컴포지션 입력. Player 미리보기와 서버 렌더링이 같은 props 를 사용한다. */
export const ReelCompositionProps = z.object({
  scenes: z.array(ReelScene).min(1),
  captionStyle: z
    .object({
      fontSize: z.number().default(64),
      color: z.string().default("#ffffff"),
      highlightColor: z.string().default("#ffd400"),
    })
    .default({ fontSize: 64, color: "#ffffff", highlightColor: "#ffd400" }),
});
export type ReelCompositionProps = z.infer<typeof ReelCompositionProps>;

export function totalDurationInFrames(props: Pick<ReelCompositionProps, "scenes">): number {
  return props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
}

export function secToFrames(sec: number, fps = VIDEO_FPS): number {
  return Math.max(1, Math.round(sec * fps));
}
