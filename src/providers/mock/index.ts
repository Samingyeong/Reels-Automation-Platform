/**
 * 개발·테스트용 Mock provider. 외부 호출·비용이 없고 결과가 결정적이다.
 * Mock 결과임을 숨기지 않는다: provider 이름이 항상 "mock-*" 이며 UI 에 배지로 표시한다.
 */
import type { Caption, Script, ScriptInput } from "../../domain/schemas";
import { contentHash } from "../../domain/hash";
import {
  ProviderError,
  type CaptionProvider,
  type ProviderInfo,
  type ContainerStatus,
  type InsightsProvider,
  type Providers,
  type PublisherProvider,
  type SceneVideoProvider,
  type SceneVideoResult,
  type ScriptProvider,
  type SpeechProvider,
} from "../types";

const mockInfo = (name: string, extra: Partial<ProviderInfo> = {}): ProviderInfo => ({
  name,
  mode: "mock",
  languages: ["ko", "en"],
  commercialUse: "yes", // 외부 생성물이 없으므로 제약 없음
  async: false,
  perSceneGeneration: true,
  ...extra,
});

/**
 * 장애 주입 표식. 프롬프트/문장에 포함되면 Mock 이 해당 오류를 낸다.
 * 유료 API 없이 재시도·실패 복구 경로를 테스트하기 위함.
 */
export const MOCK_FAIL_RETRYABLE = "[mock:fail-retryable]";
export const MOCK_FAIL_FATAL = "[mock:fail-fatal]";

function injectFault(provider: string, text: string) {
  if (text.includes(MOCK_FAIL_FATAL)) {
    throw new ProviderError("mock 영구 오류 (정책 위반 모사)", { provider, retryable: false, code: "MOCK_FATAL" });
  }
  if (text.includes(MOCK_FAIL_RETRYABLE)) {
    throw new ProviderError("mock 일시 오류 (503 모사)", { provider, retryable: true, code: "MOCK_503" });
  }
}

const PALETTE = ["#1e3a8a", "#7c2d12", "#14532d", "#581c87", "#0f766e", "#9f1239"];

export const mockScriptProvider: ScriptProvider = {
  name: "mock-script",
  info: mockInfo("mock-script"),
  estimateCostUsd: () => 0,
  async generateScript(input: ScriptInput): Promise<Script> {
    injectFault("mock-script", input.topic);
    const sceneCount = Math.min(6, Math.max(3, Math.round(input.targetDurationSec / 6)));
    const per = Math.round((input.targetDurationSec / sceneCount) * 10) / 10;
    return {
      title: `${input.topic} 핵심 정리`,
      hook: `${input.topic}, 30초 만에 알려드립니다.`,
      scenes: Array.from({ length: sceneCount }, (_, i) => ({
        narration: `${input.topic}에 대한 ${i + 1}번째 포인트입니다.`,
        visualPrompt: `${input.topic} concept illustration, scene ${i + 1}, vertical 9:16`,
        durationSec: per,
      })),
      caption: `${input.topic}에 대해 알아봤어요.`,
      hashtags: ["#shorts", "#reels"],
    };
  },
};

export const mockSceneVideoProvider: SceneVideoProvider = {
  name: "mock-scene-video",
  info: mockInfo("mock-scene-video"),
  estimateCostUsd: () => 0,
  async start(req) {
    injectFault("mock-scene-video", req.prompt);
    const idx = parseInt(contentHash(req.prompt).slice(0, 8), 16) % PALETTE.length;
    return {
      status: "completed",
      output: { placeholder: { color: PALETTE[idx], label: req.prompt.slice(0, 60) } },
    };
  },
  async poll() {
    throw new Error("mock-scene-video 는 동기형이므로 poll 을 호출하면 안 됩니다.");
  },
};

/**
 * 비동기 작업형 영상 API 모사 (대부분의 AI 영상 생성 API 형태).
 * start → processing(externalJobId) → poll N회 후 completed. 결과는 externalJobId 로 결정되므로
 * 워커가 재시작돼도 저장된 id 로 폴링을 이어갈 수 있다.
 */
export function createAsyncMockSceneVideoProvider(opts: { pollsUntilDone?: number } = {}): SceneVideoProvider & {
  startCalls: number;
} {
  const pollsUntilDone = opts.pollsUntilDone ?? 2;
  const polls = new Map<string, number>();
  const provider = {
    name: "mock-scene-video-async",
    info: mockInfo("mock-scene-video-async", { async: true }),
    startCalls: 0,
    estimateCostUsd: () => 0,
    async start(req: Parameters<SceneVideoProvider["start"]>[0]): Promise<SceneVideoResult> {
      provider.startCalls++;
      injectFault("mock-scene-video-async", req.prompt);
      const externalJobId = `mockjob_${contentHash(req).slice(0, 16)}`;
      return { status: "processing", externalJobId };
    },
    async poll(externalJobId: string): Promise<SceneVideoResult> {
      if (!externalJobId.startsWith("mockjob_")) {
        return { status: "failed", error: new ProviderError("unknown job", { provider: "mock-scene-video-async", retryable: false }) };
      }
      const n = (polls.get(externalJobId) ?? 0) + 1;
      polls.set(externalJobId, n);
      if (n < pollsUntilDone) return { status: "processing", externalJobId };
      const idx = parseInt(externalJobId.slice(8, 16), 16) % PALETTE.length;
      return { status: "completed", output: { placeholder: { color: PALETTE[idx], label: externalJobId } } };
    },
  };
  return provider;
}

/** 한국어 기준 대략 초당 7음절로 길이를 추정한다. */
export function estimateSpeechMs(text: string): number {
  const chars = text.replace(/\s+/g, "").length;
  return Math.max(800, Math.round((chars / 7) * 1000));
}

/** 단어 길이에 비례해 시간을 배분하는 단순 자막 정렬. 실제 정렬 provider 의 fallback 으로도 쓴다. */
export function proportionalCaptions(text: string, durationMs: number): Caption[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((s, w) => s + w.length, 0) || 1;
  let cursor = 0;
  return words.map((w, i) => {
    const len = i === words.length - 1 ? durationMs - cursor : Math.round((w.length / total) * durationMs);
    const caption: Caption = {
      text: i === 0 ? w : ` ${w}`,
      startMs: cursor,
      endMs: cursor + len,
      timestampMs: cursor + len / 2,
      confidence: null,
    };
    cursor += len;
    return caption;
  });
}

export const mockSpeechProvider: SpeechProvider = {
  name: "mock-speech",
  info: mockInfo("mock-speech"),
  estimateCostUsd: () => 0,
  async synthesize(req) {
    injectFault("mock-speech", req.text);
    const durationMs = estimateSpeechMs(req.text);
    return { audio: null, durationMs, captions: proportionalCaptions(req.text, durationMs) };
  },
};

export const mockCaptionProvider: CaptionProvider = {
  name: "mock-caption",
  async align({ text, durationMs }) {
    return proportionalCaptions(text, durationMs);
  },
};

/** 실제 게시를 절대 하지 않는 Publisher. 호출 기록만 남긴다. */
export function createMockPublisher(): PublisherProvider & { calls: string[] } {
  const containers = new Map<string, ContainerStatus>();
  const calls: string[] = [];
  let seq = 0;
  return {
    name: "mock-publisher",
    calls,
    async createReelContainer(req) {
      calls.push(`create:${req.igUserId}`);
      const containerId = `mock-container-${++seq}`;
      containers.set(containerId, "FINISHED");
      return { containerId };
    },
    async getContainerStatus(containerId) {
      return { status: containers.get(containerId) ?? "ERROR" };
    },
    async publishContainer(_igUserId, containerId) {
      calls.push(`publish:${containerId}`);
      if (containers.get(containerId) !== "FINISHED") {
        throw new Error(`컨테이너 ${containerId} 는 게시 가능한 상태가 아닙니다.`);
      }
      containers.set(containerId, "PUBLISHED");
      return { mediaId: `mock-media-${containerId}` };
    },
    async getPermalink() {
      return null; // Mock 은 실제 게시물이 없으므로 링크를 만들지 않는다.
    },
    async getPublishingQuota() {
      return { used: 0, limit: 100 };
    },
  };
}

export const mockInsightsProvider: InsightsProvider = {
  name: "mock-insights",
  async getReelInsights() {
    return {}; // 가짜 성과 수치를 만들지 않는다.
  },
};

export function createMockProviders(): Providers {
  return {
    script: mockScriptProvider,
    sceneVideo: mockSceneVideoProvider,
    speech: mockSpeechProvider,
    caption: mockCaptionProvider,
    publisher: createMockPublisher(),
    insights: mockInsightsProvider,
  };
}
