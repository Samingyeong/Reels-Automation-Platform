/**
 * 개발·테스트용 Mock provider. 외부 호출·비용이 없고 결과가 결정적이다.
 * Mock 결과임을 숨기지 않는다: provider 이름이 항상 "mock-*" 이며 UI 에 배지로 표시한다.
 */
import type { Caption, Script, ScriptInput } from "../../domain/schemas";
import { contentHash } from "../../domain/hash";
import type {
  CaptionProvider,
  ContainerStatus,
  InsightsProvider,
  Providers,
  PublisherProvider,
  SceneVideoProvider,
  ScriptProvider,
  SpeechProvider,
} from "../types";

const PALETTE = ["#1e3a8a", "#7c2d12", "#14532d", "#581c87", "#0f766e", "#9f1239"];

export const mockScriptProvider: ScriptProvider = {
  name: "mock-script",
  async generateScript(input: ScriptInput): Promise<Script> {
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
  async start(req) {
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
  async synthesize(req) {
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
