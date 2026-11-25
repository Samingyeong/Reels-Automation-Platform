import { Composition } from "remotion";
import {
  REEL_COMPOSITION_ID,
  ReelCompositionProps,
  totalDurationInFrames,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../domain/schemas";
import { ReelComposition } from "./Reel/ReelComposition";
import { sampleReelProps } from "./Reel/sample";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={REEL_COMPOSITION_ID}
      component={ReelComposition}
      schema={ReelCompositionProps}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      durationInFrames={totalDurationInFrames(sampleReelProps)}
      defaultProps={sampleReelProps}
      calculateMetadata={({ props }) => ({ durationInFrames: totalDurationInFrames(props) })}
    />
  );
};
