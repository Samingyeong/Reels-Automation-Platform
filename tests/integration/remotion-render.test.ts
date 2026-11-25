import { describe, expect, it } from "vitest";
import { createRemotionRenderer } from "../../src/server/render/remotion-renderer";

/** MP4 최상위 박스 순서 (ftyp, moov, mdat …) */
function topLevelBoxes(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const boxes: string[] = [];
  let offset = 0;
  while (offset + 8 <= data.byteLength) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (size === 1) size = Number(view.getBigUint64(offset + 8));
    if (size < 8) break;
    boxes.push(type);
    offset += size;
  }
  return boxes;
}

const ascii = (data: Uint8Array) => Buffer.from(data).toString("latin1");

/**
 * 실제 Remotion 렌더 (Chromium + ffmpeg). `.remotion-bundle` 이 필요하다 (npm run remotion:bundle).
 * Instagram Reels 규격(DR-003): MP4, moov 가 앞쪽(faststart), H.264 + AAC.
 */
describe("Remotion 실제 렌더", () => {
  it("짧은 컴포지션을 Reels 규격 MP4 로 렌더한다", async () => {
    const render = createRemotionRenderer();
    const out = await render({
      captionStyle: { fontSize: 64, color: "#ffffff", highlightColor: "#ffd400" },
      scenes: [
        {
          id: "t1",
          durationInFrames: 30,
          visual: { type: "placeholder", color: "#1e3a8a", label: "render test" },
          audioSrc: null,
          captions: [{ text: "렌더", startMs: 0, endMs: 900, timestampMs: null, confidence: null }],
        },
      ],
    });
    expect(out.durationMs).toBe(1000);
    const boxes = topLevelBoxes(out.data);
    expect(boxes[0]).toBe("ftyp");
    expect(boxes.indexOf("moov")).toBeGreaterThan(-1);
    expect(boxes.indexOf("moov")).toBeLessThan(boxes.indexOf("mdat")); // faststart
    const text = ascii(out.data);
    expect(text).toContain("avc1"); // H.264
    expect(text).toContain("mp4a"); // AAC (enforceAudioTrack)
  }, 240_000);
});
