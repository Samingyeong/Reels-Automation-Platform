/**
 * 외부 API provider 인터페이스 (공통 계약).
 *
 * 규칙
 * - 서버/워커 전용. 클라이언트 컴포넌트에서 import 금지 (API 키 보호).
 * - 모든 provider 는 `name` 을 가지며 jobInputKey 에 포함되어 비용 중복을 막는다.
 * - 일시적 실패는 `ProviderError({ retryable: true })`, 입력 오류·정책 위반은 retryable: false.
 * - 성공은 실제 결과물(파일/URL/ID)이 있을 때만 반환한다. 빈 결과로 성공을 흉내내지 않는다.
 */
import type { Caption, Script, ScriptInput } from "../domain/schemas";

export class ProviderError extends Error {
  readonly provider: string;
  readonly retryable: boolean;
  readonly code?: string;
  constructor(
    message: string,
    opts: { provider: string; retryable: boolean; code?: string; cause?: unknown },
  ) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.provider = opts.provider;
    this.retryable = opts.retryable;
    this.code = opts.code;
  }
}

/**
 * Provider 메타데이터. D-3/D-4 선정 기준(docs/decisions.md DR-004)을 코드로 표현해
 * 교체 시 비교·검증할 수 있게 한다. 값을 모르면 "unknown" 으로 두고 추측하지 않는다.
 */
export type ProviderInfo = {
  /** 멱등 키에 포함되는 이름. 모델·보이스 등 결과에 영향을 주는 설정을 포함한다. */
  name: string;
  mode: "mock" | "live";
  /** 지원 언어 (BCP-47). 한국어 지원 여부 판단용 */
  languages: string[] | "unknown";
  /** 생성물 상업적 이용 가능 여부 (약관 확인 결과) */
  commercialUse: "yes" | "no" | "conditional" | "unknown";
  /** 비동기 작업형(start/poll) 여부 */
  async: boolean;
  /** 장면 단위 개별 생성 가능 여부 (특정 장면만 재생성) */
  perSceneGeneration: boolean;
  /** 확인한 문서 URL·날짜 등 근거 */
  reference?: string;
};

/** 생성된 바이너리. 워커가 Supabase Storage 에 업로드한다. */
export type BinaryOutput = {
  data: Uint8Array;
  mimeType: string;
};

// ---------- 1. 대본 ----------
export interface ScriptProvider {
  readonly name: string;
  readonly info: ProviderInfo;
  /** 호출 전 예상 비용(USD). 유료 호출 전 예산 확인에 사용. 모르면 null */
  estimateCostUsd(input: ScriptInput): number | null;
  generateScript(input: ScriptInput): Promise<Script>;
}

// ---------- 2. 장면 영상 ----------
export type SceneVideoRequest = {
  prompt: string;
  durationSec: number;
  width: number;
  height: number;
};

/**
 * 외부 영상 생성 API 는 대부분 비동기 작업형이다.
 * start → (poll 반복) → completed. 동기형 provider 는 start 에서 바로 completed 를 반환한다.
 */
export type SceneVideoResult =
  | { status: "processing"; externalJobId: string }
  | { status: "completed"; output: BinaryOutput | { placeholder: { color: string; label: string } } }
  | { status: "failed"; error: ProviderError };

export interface SceneVideoProvider {
  readonly name: string;
  readonly info: ProviderInfo;
  estimateCostUsd(req: SceneVideoRequest): number | null;
  start(req: SceneVideoRequest): Promise<SceneVideoResult>;
  poll(externalJobId: string): Promise<SceneVideoResult>;
}

// ---------- 3. 나레이션 ----------
export type SpeechRequest = { text: string; voiceId: string; language: string };
export type SpeechResult = {
  /** null 은 오디오 없는 Mock 결과에서만 허용된다. */
  audio: BinaryOutput | null;
  durationMs: number;
  /** provider 가 단어 타이밍을 제공하면 채운다. 없으면 CaptionProvider 로 생성한다. */
  captions: Caption[] | null;
};

export interface SpeechProvider {
  readonly name: string;
  readonly info: ProviderInfo;
  estimateCostUsd(req: SpeechRequest): number | null;
  synthesize(req: SpeechRequest): Promise<SpeechResult>;
}

// ---------- 4. 자막 ----------
export interface CaptionProvider {
  readonly name: string;
  /** 오디오와 원문 대본으로 단어 단위 타이밍 자막을 만든다. */
  align(req: { text: string; durationMs: number; audio: BinaryOutput | null }): Promise<Caption[]>;
}

// ---------- 5. 발행 ----------
export type PublishRequest = {
  igUserId: string;
  accessToken: string;
  /** Instagram 서버가 가져갈 수 있는 공개 URL (Storage signed URL). */
  videoUrl: string;
  caption: string;
  coverUrl?: string;
  shareToFeed: boolean;
};

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export interface PublisherProvider {
  readonly name: string;
  createReelContainer(req: PublishRequest): Promise<{ containerId: string }>;
  getContainerStatus(
    containerId: string,
    accessToken: string,
  ): Promise<{ status: ContainerStatus; message?: string }>;
  publishContainer(
    igUserId: string,
    containerId: string,
    accessToken: string,
  ): Promise<{ mediaId: string }>;
  getPermalink(mediaId: string, accessToken: string): Promise<string | null>;
  getPublishingQuota(igUserId: string, accessToken: string): Promise<{ used: number; limit: number }>;
}

// ---------- 6. 성과 ----------
export type ReelInsights = Partial<
  Record<
    "views" | "reach" | "likes" | "comments" | "shares" | "saved" | "total_interactions",
    number
  >
>;

export interface InsightsProvider {
  readonly name: string;
  getReelInsights(mediaId: string, accessToken: string): Promise<ReelInsights>;
}

export type Providers = {
  script: ScriptProvider;
  sceneVideo: SceneVideoProvider;
  speech: SpeechProvider;
  caption: CaptionProvider;
  publisher: PublisherProvider;
  insights: InsightsProvider;
};
