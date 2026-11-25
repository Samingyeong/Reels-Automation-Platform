import type { ReelCompositionProps } from "../../domain/schemas";
import { secToFrames } from "../../domain/schemas";

/** Remotion Studio·미리보기용 결정적 샘플 데이터 (Mock). */
const lines = [
  "아침 커피, 언제 마시는 게 좋을까요?",
  "기상 직후보다 한두 시간 뒤가 좋습니다.",
  "코르티솔이 자연스럽게 떨어진 뒤니까요.",
];

export const sampleReelProps: ReelCompositionProps = {
  captionStyle: { fontSize: 64, color: "#ffffff", highlightColor: "#ffd400" },
  scenes: lines.map((text, i) => {
    const durationMs = 2500;
    const words = text.split(" ");
    const per = durationMs / words.length;
    return {
      id: `sample-${i + 1}`,
      durationInFrames: secToFrames(durationMs / 1000),
      visual: { type: "placeholder" as const, color: ["#1e3a8a", "#7c2d12", "#14532d"][i], label: `scene ${i + 1}` },
      audioSrc: null,
      captions: words.map((w, j) => ({
        text: j === 0 ? w : ` ${w}`,
        startMs: Math.round(j * per),
        endMs: Math.round((j + 1) * per),
        timestampMs: null,
        confidence: null,
      })),
    };
  }),
};
