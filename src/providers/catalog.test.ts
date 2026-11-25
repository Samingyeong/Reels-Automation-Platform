import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { DEFAULT_SELECTION, PROVIDER_CATALOG, ProviderSelectionError, checkBudget, estimateReelCostUsd, resolveSelection, videoSceneIndexes } =
  await import("./catalog");

describe("provider 카탈로그·선택", () => {
  it("기본 선택은 모두 mock 이고 비용 0", () => {
    const p = resolveSelection(DEFAULT_SELECTION, "mock");
    expect([p.script.name, p.sceneVisual.name, p.speech.name]).toEqual(["mock-script", "mock-scene-video", "mock-speech"]);
    const est = estimateReelCostUsd(p, { topic: "t", targetDurationSec: 30, scenes: [{ prompt: "a", durationSec: 5, narration: "가" }] });
    expect(est).toEqual({ totalUsd: 0, unknown: [] });
    expect(checkBudget(est, 0, 0)).toBeNull();
  });

  it("구현 전(planned) provider 는 거부 — mock 으로 대체하지 않는다", () => {
    expect(() => resolveSelection({ ...DEFAULT_SELECTION, speech: "elevenlabs-v3" }, "live")).toThrow(ProviderSelectionError);
    expect(() => resolveSelection({ ...DEFAULT_SELECTION, script: "nope" }, "mock")).toThrow(/알 수 없는/);
  });

  it("카탈로그 id 는 종류별로 유일", () => {
    const keys = PROVIDER_CATALOG.map((e) => `${e.kind}:${e.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of PROVIDER_CATALOG) if (e.status === "available") expect(e.create).toBeTypeOf("function");
  });

  it("혼합 방식은 훅(첫 장면)과 가장 긴 장면만 영상", () => {
    expect([...videoSceneIndexes("hybrid", [3, 5, 8, 4])].sort()).toEqual([0, 2]);
    expect(videoSceneIndexes("image_motion", [3, 5]).size).toBe(0);
    expect(videoSceneIndexes("video", [3, 5]).size).toBe(2);
  });

  it("예산 가드: 추정 불가 또는 초과 시 거부", () => {
    expect(checkBudget({ totalUsd: 0.5, unknown: ["x"] }, 0, 100)).toMatch(/추정할 수 없는/);
    expect(checkBudget({ totalUsd: 2, unknown: [] }, 9, 10)).toMatch(/월 예산 초과/);
    expect(checkBudget({ totalUsd: 2, unknown: [] }, 7, 10)).toBeNull();
  });
});
