import { describe, expect, it } from "vitest";
import {
  describeSceneVideoContract,
  describeScriptContract,
  describeSpeechContract,
  expectProviderError,
  runSceneVideoToCompletion,
} from "../contract";
import {
  createAsyncMockSceneVideoProvider,
  MOCK_FAIL_FATAL,
  MOCK_FAIL_RETRYABLE,
  mockSceneVideoProvider,
  mockScriptProvider,
  mockSpeechProvider,
} from "./index";

describeScriptContract("mock-script", () => mockScriptProvider);
describeSceneVideoContract("mock-scene-video (sync)", () => mockSceneVideoProvider);
describeSceneVideoContract("mock-scene-video-async", () => createAsyncMockSceneVideoProvider());
describeSpeechContract("mock-speech", () => mockSpeechProvider);

describe("Mock 장애 주입 (유료 API 없이 실패 경로 테스트)", () => {
  it("retryable / fatal 오류를 구분해 던진다", async () => {
    await mockScriptProvider
      .generateScript({ topic: `x ${MOCK_FAIL_RETRYABLE}`, targetDurationSec: 30, language: "ko" })
      .then(() => expect.fail("should throw"), (e) => expectProviderError(e, true));
    await mockSpeechProvider
      .synthesize({ text: `x ${MOCK_FAIL_FATAL}`, voiceId: "v", language: "ko" })
      .then(() => expect.fail("should throw"), (e) => expectProviderError(e, false));
  });

  it("비동기 provider: 같은 입력은 같은 externalJobId (재시작 후 폴링 재개 가능)", async () => {
    const a = createAsyncMockSceneVideoProvider({ pollsUntilDone: 3 });
    const req = { prompt: "p", durationSec: 3, width: 1080, height: 1920 };
    const s1 = await a.start(req);
    const s2 = await a.start(req);
    expect(s1).toEqual(s2);
    const done = await runSceneVideoToCompletion(a, req);
    expect(done.status).toBe("completed");
    expect(a.startCalls).toBe(3);
  });

  it("모든 mock 의 예상 비용은 0", () => {
    expect(mockScriptProvider.estimateCostUsd({ topic: "x", targetDurationSec: 30, language: "ko" })).toBe(0);
    expect(mockSpeechProvider.info.mode).toBe("mock");
  });
});
