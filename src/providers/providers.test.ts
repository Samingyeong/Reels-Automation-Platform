import { describe, expect, it } from "vitest";
import { contentHash, jobInputKey, stableStringify } from "../domain/hash";
import { Script } from "../domain/schemas";
import { createMockPublisher, mockScriptProvider, proportionalCaptions } from "./mock";
import { getProviders, readMode } from "./registry";

describe("hash", () => {
  it("키 순서와 무관", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(
      stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }),
    );
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });
  it("provider 가 다르면 키가 다르다", () => {
    expect(jobInputKey("tts", "a", { t: 1 })).not.toBe(jobInputKey("tts", "b", { t: 1 }));
  });
});

describe("mock providers", () => {
  it("대본 mock 은 스키마를 만족", async () => {
    const script = await mockScriptProvider.generateScript({
      topic: "커피",
      targetDurationSec: 30,
      language: "ko",
    });
    expect(() => Script.parse(script)).not.toThrow();
  });

  it("자막 타이밍은 전체 길이를 정확히 채운다", () => {
    const caps = proportionalCaptions("하나 둘 셋 넷", 2000);
    expect(caps[0].startMs).toBe(0);
    expect(caps.at(-1)?.endMs).toBe(2000);
    for (let i = 1; i < caps.length; i++) expect(caps[i].startMs).toBe(caps[i - 1].endMs);
  });

  it("mock publisher 는 permalink 를 만들지 않는다 (가짜 성공 방지)", async () => {
    const p = createMockPublisher();
    const { containerId } = await p.createReelContainer({
      igUserId: "u",
      accessToken: "t",
      videoUrl: "https://example.com/v.mp4",
      caption: "",
      shareToFeed: true,
    });
    const { mediaId } = await p.publishContainer("u", containerId, "t");
    expect(mediaId).toContain("mock-");
    expect(await p.getPermalink(mediaId, "t")).toBeNull();
    await expect(p.publishContainer("u", containerId, "t")).rejects.toThrow();
  });
});

describe("registry", () => {
  it("기본값은 mock", () => {
    expect(getProviders({}).publisher.name).toBe("mock-publisher");
  });
  it("미구현 live 는 mock 으로 대체하지 않고 에러", () => {
    expect(() => getProviders({ PUBLISH_MODE: "live" })).toThrow();
    expect(() => readMode("prod", "X")).toThrow();
  });
});
