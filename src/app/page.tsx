"use client";

import { Player } from "@remotion/player";
import { totalDurationInFrames, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "../domain/schemas";
import { ReelComposition } from "../remotion/Reel/ReelComposition";
import { sampleReelProps } from "../remotion/Reel/sample";

/**
 * M0 placeholder: 컴포지션 계약 확인용 미리보기.
 * 프로젝트 목록·검수 화면은 M1~M2 에서 구현한다 (docs/06-work-plan.md).
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-1 text-xl font-bold text-foreground">Reels Automation Platform</h1>
      <p className="mb-6 text-sm text-subtitle">M0 · Mock 데이터 미리보기 (실제 생성 결과 아님)</p>
      <div className="overflow-hidden rounded-xl shadow-lg">
        <Player
          component={ReelComposition}
          inputProps={sampleReelProps}
          durationInFrames={totalDurationInFrames(sampleReelProps)}
          fps={VIDEO_FPS}
          compositionWidth={VIDEO_WIDTH}
          compositionHeight={VIDEO_HEIGHT}
          style={{ width: "100%" }}
          controls
          loop
        />
      </div>
    </main>
  );
}
