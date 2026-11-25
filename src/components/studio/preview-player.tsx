"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef } from "react";
import { totalDurationInFrames, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH, type ReelCompositionProps } from "@/domain/schemas";
import { ReelComposition } from "@/remotion/Reel/ReelComposition";

/** 최종 렌더와 같은 컴포지션·같은 props 로 브라우저에서 미리보기 (렌더 횟수에 포함되지 않음) */
export const PreviewPlayer = forwardRef<PlayerRef, { props: ReelCompositionProps; autoPlay?: boolean }>(
  function PreviewPlayer({ props, autoPlay }, ref) {
    return (
      <Player
        ref={ref}
        component={ReelComposition}
        inputProps={props}
        durationInFrames={Math.max(1, totalDurationInFrames(props))}
        fps={VIDEO_FPS}
        compositionWidth={VIDEO_WIDTH}
        compositionHeight={VIDEO_HEIGHT}
        style={{ width: "100%", height: "100%" }}
        controls
        loop
        autoPlay={autoPlay}
        clickToPlay
        acknowledgeRemotionLicense
      />
    );
  },
);
