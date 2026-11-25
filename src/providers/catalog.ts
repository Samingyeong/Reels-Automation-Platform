/**
 * Provider 카탈로그 + 선택 해석 (docs/decisions.md DR-016, docs/08-m3-provider-research.md).
 *
 * - 대본·장면 시각물·음성 provider 를 **id 로 선택**한다. 선택은 서비스 설정(user_settings)에 저장되고,
 *   프로젝트 생성 시 스냅샷으로 고정된다(DR-016 의 DB 단계). 이 모듈은 그 선택을 실제 구현으로 바꾸는 순수 로직이다.
 * - "planned" 항목은 조사만 끝난 후보다. 선택하면 조용히 Mock 으로 대체하지 않고 오류를 낸다.
 * - live provider 는 PROVIDER_MODE=live 일 때만 허용된다 (DR-005 이중 잠금: 설정 + 배포 환경변수).
 * - 서버/워커 전용. 클라이언트에는 `catalogForClient()` 결과(이름·상태·단가)만 전달한다.
 */
import "server-only";
import { createAsyncMockSceneVideoProvider, mockScriptProvider, mockSceneVideoProvider, mockSpeechProvider } from "./mock";
import type { ProviderMode } from "./registry";
import type { SceneVideoProvider, ScriptProvider, SpeechProvider } from "./types";

export type ProviderKind = "script" | "sceneVisual" | "speech";
/** 영상 제작 방식 (docs/08 §2): A 이미지+모션 / B AI 영상 / C 혼합 */
export type VisualStrategy = "image_motion" | "video" | "hybrid";

type Factory<K extends ProviderKind> = () => K extends "script"
  ? ScriptProvider
  : K extends "sceneVisual"
    ? SceneVideoProvider
    : SpeechProvider;

export type CatalogEntry<K extends ProviderKind = ProviderKind> = {
  id: string;
  kind: K;
  label: string;
  mode: "mock" | "live";
  /** available: 구현됨 / planned: 조사만 완료(선택 불가) */
  status: "available" | "planned";
  /** sceneVisual 전용: 이미지(정지) 또는 영상 출력 */
  output?: "image" | "video";
  /** 조사 단가 메모 (UI 표시·예산 추정 근거). 실제 추정은 provider.estimateCostUsd */
  priceNote?: string;
  reference?: string;
  create?: Factory<K>;
};

const entries: CatalogEntry[] = [
  // 대본
  { id: "mock-script", kind: "script", label: "Mock 대본", mode: "mock", status: "available", create: () => mockScriptProvider },
  {
    id: "anthropic-claude-opus-5-5",
    kind: "script",
    label: "Claude Opus 5.5",
    mode: "live",
    status: "planned",
    priceNote: "입력 $4 / 출력 $20 per 1M tokens (편당 약 $0.07)",
    reference: "claude-api skill",
  },
  // 장면 시각물
  { id: "mock-scene-video", kind: "sceneVisual", label: "Mock 장면", mode: "mock", status: "available", output: "video", create: () => mockSceneVideoProvider },
  {
    id: "mock-scene-video-async",
    kind: "sceneVisual",
    label: "Mock 장면 (비동기)",
    mode: "mock",
    status: "available",
    output: "video",
    create: () => createAsyncMockSceneVideoProvider(),
  },
  { id: "google-imagen-4-fast", kind: "sceneVisual", label: "Imagen 4 Fast", mode: "live", status: "planned", output: "image", priceNote: "$0.02/장" },
  { id: "google-gemini-3-1-flash-image", kind: "sceneVisual", label: "Gemini 3.1 Flash Image", mode: "live", status: "planned", output: "image", priceNote: "약 $0.067/장 (1K)" },
  { id: "runway-gen-4-turbo", kind: "sceneVisual", label: "Runway Gen-4 Turbo", mode: "live", status: "planned", output: "video", priceNote: "$0.05/초" },
  { id: "kling-4", kind: "sceneVisual", label: "Kling 4.0", mode: "live", status: "planned", output: "video", priceNote: "약 $0.15/초 (720p)" },
  { id: "google-veo-3-1", kind: "sceneVisual", label: "Veo 3.1", mode: "live", status: "planned", output: "video", priceNote: "$0.20 (단위 검증 필요)" },
  // 음성
  { id: "mock-speech", kind: "speech", label: "Mock 음성", mode: "mock", status: "available", create: () => mockSpeechProvider },
  { id: "google-chirp-3-hd", kind: "speech", label: "Google Chirp 3 HD", mode: "live", status: "planned", priceNote: "$30/1M자, 월 1M자 무료" },
  { id: "elevenlabs-v3", kind: "speech", label: "ElevenLabs v3", mode: "live", status: "planned", priceNote: "$0.08/1천 자" },
];

export const PROVIDER_CATALOG: readonly CatalogEntry[] = entries;

export type ProviderSelection = {
  script: string;
  /** 기본 장면 시각물 provider */
  sceneVisual: string;
  /** hybrid 에서 훅·핵심 장면에 쓰는 영상 provider (없으면 sceneVisual) */
  sceneVideo?: string;
  speech: string;
  visualStrategy: VisualStrategy;
  /** 월 예산(USD). 예상 비용이 남은 예산을 넘으면 유료 작업을 시작하지 않는다 */
  monthlyBudgetUsd: number;
};

export const DEFAULT_SELECTION: ProviderSelection = {
  script: "mock-script",
  sceneVisual: "mock-scene-video",
  speech: "mock-speech",
  visualStrategy: "video",
  monthlyBudgetUsd: 0,
};

export class ProviderSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSelectionError";
  }
}

function pick<K extends ProviderKind>(kind: K, id: string, mode: ProviderMode): CatalogEntry<K> {
  const entry = entries.find((e) => e.kind === kind && e.id === id) as CatalogEntry<K> | undefined;
  if (!entry) throw new ProviderSelectionError(`알 수 없는 ${kind} provider: ${id}`);
  if (entry.status !== "available" || !entry.create) {
    throw new ProviderSelectionError(`${entry.label}(${id}) 는 아직 구현되지 않았습니다. Mock 으로 대체하지 않습니다.`);
  }
  if (entry.mode === "live" && mode !== "live") {
    throw new ProviderSelectionError(`${entry.label} 는 유료 provider 입니다: PROVIDER_MODE=live 와 사용자 승인이 필요합니다.`);
  }
  return entry;
}

export type SelectedProviders = {
  script: ScriptProvider;
  sceneVisual: SceneVideoProvider;
  sceneVideo: SceneVideoProvider;
  speech: SpeechProvider;
  visualStrategy: VisualStrategy;
};

/** 선택 → 구현. 하나라도 사용할 수 없으면 전체를 거부한다 (부분 대체 금지). */
export function resolveSelection(selection: ProviderSelection, mode: ProviderMode): SelectedProviders {
  const sceneVisual = pick("sceneVisual", selection.sceneVisual, mode);
  const sceneVideo = pick("sceneVisual", selection.sceneVideo ?? selection.sceneVisual, mode);
  if (selection.visualStrategy === "image_motion" && sceneVisual.output !== "image" && sceneVisual.mode === "live") {
    throw new ProviderSelectionError("이미지+모션 방식에는 이미지 provider 를 선택해야 합니다.");
  }
  if (selection.visualStrategy !== "image_motion" && sceneVideo.output !== "video") {
    throw new ProviderSelectionError("영상·혼합 방식에는 영상 provider 가 필요합니다.");
  }
  return {
    script: pick("script", selection.script, mode).create!(),
    sceneVisual: sceneVisual.create!(),
    sceneVideo: sceneVideo.create!(),
    speech: pick("speech", selection.speech, mode).create!(),
    visualStrategy: selection.visualStrategy,
  };
}

/** 혼합 방식에서 영상 provider 를 쓰는 장면: 첫 장면(훅) + 가장 긴 장면 1개 */
export function videoSceneIndexes(strategy: VisualStrategy, sceneDurationsSec: number[]): Set<number> {
  if (strategy === "video") return new Set(sceneDurationsSec.map((_, i) => i));
  if (strategy === "image_motion" || sceneDurationsSec.length === 0) return new Set();
  let longest = sceneDurationsSec.length > 1 ? 1 : 0;
  for (let i = 1; i < sceneDurationsSec.length; i++) if (sceneDurationsSec[i] > sceneDurationsSec[longest]) longest = i;
  return new Set([0, longest]);
}

export type CostEstimate = { totalUsd: number; unknown: string[] };

/**
 * 한 편 예상 비용. provider 가 null(모름)을 돌려주면 0 으로 치지 않고 unknown 에 기록한다
 * → 호출부는 unknown 이 있으면 유료 작업을 시작하지 않는다.
 */
export function estimateReelCostUsd(
  p: SelectedProviders,
  plan: { topic: string; targetDurationSec: number; scenes: { prompt: string; durationSec: number; narration: string }[] },
  opts: { width?: number; height?: number; regenerationFactor?: number } = {},
): CostEstimate {
  const unknown: string[] = [];
  let total = 0;
  const add = (name: string, v: number | null, factor = 1) => {
    if (v === null) unknown.push(name);
    else total += v * factor;
  };
  const factor = opts.regenerationFactor ?? 1.5;
  add(p.script.name, p.script.estimateCostUsd({ topic: plan.topic, targetDurationSec: plan.targetDurationSec, language: "ko" }));
  const videoIdx = videoSceneIndexes(p.visualStrategy, plan.scenes.map((s) => s.durationSec));
  plan.scenes.forEach((s, i) => {
    const provider = videoIdx.has(i) ? p.sceneVideo : p.sceneVisual;
    add(provider.name, provider.estimateCostUsd({ prompt: s.prompt, durationSec: s.durationSec, width: opts.width ?? 1080, height: opts.height ?? 1920 }), factor);
  });
  const narration = plan.scenes.map((s) => s.narration).join(" ");
  add(p.speech.name, p.speech.estimateCostUsd({ text: narration, voiceId: "default", language: "ko" }));
  return { totalUsd: Math.round(total * 10000) / 10000, unknown: [...new Set(unknown)] };
}

/** 예산 가드: 이번 달 사용액 + 예상 비용이 예산을 넘거나 추정 불가 항목이 있으면 거부 사유를 반환 */
export function checkBudget(estimate: CostEstimate, spentThisMonthUsd: number, monthlyBudgetUsd: number): string | null {
  if (estimate.unknown.length > 0) return `비용을 추정할 수 없는 provider: ${estimate.unknown.join(", ")}`;
  if (estimate.totalUsd === 0) return null;
  if (spentThisMonthUsd + estimate.totalUsd > monthlyBudgetUsd) {
    return `월 예산 초과: 사용 $${spentThisMonthUsd.toFixed(2)} + 예상 $${estimate.totalUsd.toFixed(2)} > 예산 $${monthlyBudgetUsd.toFixed(2)}`;
  }
  return null;
}

/** 클라이언트 표시용 (구현 함수 제외) */
export function catalogForClient() {
  return entries.map((e) => ({ id: e.id, kind: e.kind, label: e.label, mode: e.mode, status: e.status, output: e.output, priceNote: e.priceNote }));
}
