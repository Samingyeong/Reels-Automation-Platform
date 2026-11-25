/**
 * Provider 계약 테스트 스위트. Mock 과 향후 live provider 가 **같은 테스트**를 통과해야 교체 가능하다.
 * live provider 는 fetch 를 주입한 fixture 기반으로 이 스위트를 실행한다 (실제 유료 호출 금지).
 *
 * 사용: describeSceneVideoContract("pexels", () => createPexelsProvider({ fetch: fixtureFetch }))
 */
import { describe, expect, it } from "vitest";
import { Script } from "../domain/schemas";
import { ProviderError, type SceneVideoProvider, type SceneVideoResult, type ScriptProvider, type SpeechProvider } from "./types";

function expectInfo(info: { name: string; mode: string; commercialUse: string }, name: string) {
  expect(info.name).toBe(name);
  expect(["mock", "live"]).toContain(info.mode);
  expect(["yes", "no", "conditional", "unknown"]).toContain(info.commercialUse);
}

export function describeScriptContract(label: string, make: () => ScriptProvider) {
  describe(`ScriptProvider 계약: ${label}`, () => {
    it("메타데이터와 비용 추정", () => {
      const p = make();
      expectInfo(p.info, p.name);
      const cost = p.estimateCostUsd({ topic: "x", targetDurationSec: 30, language: "ko" });
      expect(cost === null || cost >= 0).toBe(true);
    });
    it("한국어 주제 → Script 스키마를 만족하는 결과", async () => {
      const script = await make().generateScript({ topic: "아침 루틴", targetDurationSec: 30, language: "ko" });
      expect(() => Script.parse(script)).not.toThrow();
    });
  });
}

/** 동기형이든 비동기형이든 start→poll 루프로 완료까지 진행 */
export async function runSceneVideoToCompletion(
  p: SceneVideoProvider,
  req: Parameters<SceneVideoProvider["start"]>[0],
  maxPolls = 20,
): Promise<SceneVideoResult> {
  let r = await p.start(req);
  for (let i = 0; i < maxPolls && r.status === "processing"; i++) r = await p.poll(r.externalJobId);
  return r;
}

export function describeSceneVideoContract(label: string, make: () => SceneVideoProvider) {
  const req = { prompt: "서울 야경 타임랩스", durationSec: 4, width: 1080, height: 1920 };
  describe(`SceneVideoProvider 계약: ${label}`, () => {
    it("메타데이터: 장면 단위 생성 지원", () => {
      const p = make();
      expectInfo(p.info, p.name);
      expect(p.info.perSceneGeneration).toBe(true);
    });
    it("완료 결과는 실제 출력(바이너리 또는 placeholder)을 포함", async () => {
      const r = await runSceneVideoToCompletion(make(), req);
      expect(r.status).toBe("completed");
      if (r.status === "completed") expect(r.output).toBeTruthy();
    });
    it("비동기형은 processing 과 externalJobId 를 반환해 재시작 후 폴링을 이어갈 수 있다", async () => {
      const p = make();
      if (!p.info.async) return;
      const first = await p.start(req);
      expect(first.status).toBe("processing");
      if (first.status === "processing") expect(first.externalJobId).toMatch(/\S+/);
    });
  });
}

export function describeSpeechContract(label: string, make: () => SpeechProvider) {
  describe(`SpeechProvider 계약: ${label}`, () => {
    it("메타데이터: 한국어 지원", () => {
      const p = make();
      expectInfo(p.info, p.name);
      if (p.info.languages !== "unknown") expect(p.info.languages).toContain("ko");
    });
    it("길이와 자막 타이밍이 일관된다", async () => {
      const r = await make().synthesize({ text: "안녕하세요 오늘의 팁입니다", voiceId: "default", language: "ko" });
      expect(r.durationMs).toBeGreaterThan(0);
      if (r.audio === null) expect(make().info.mode).toBe("mock"); // 오디오 없는 결과는 mock 만 허용
      if (r.captions) expect(r.captions.at(-1)!.endMs).toBeLessThanOrEqual(r.durationMs);
    });
  });
}

export function expectProviderError(err: unknown, retryable: boolean) {
  expect(err).toBeInstanceOf(ProviderError);
  expect((err as ProviderError).retryable).toBe(retryable);
}
