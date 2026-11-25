import { AbsoluteFill, Html5Audio, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption, ReelCompositionProps, ReelScene } from "../../domain/schemas";

const SceneVisualLayer: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const v = scene.visual;
  if (v.type === "video") {
    return <OffthreadVideo src={v.src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  if (v.type === "image") {
    return <Img src={v.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  return (
    <AbsoluteFill
      style={{ backgroundColor: v.color, justifyContent: "center", alignItems: "center", padding: 80 }}
    >
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 44, textAlign: "center", fontFamily: "sans-serif" }}>
        [MOCK] {v.label}
      </div>
    </AbsoluteFill>
  );
};

const CaptionLayer: React.FC<{
  captions: Caption[];
  style: ReelCompositionProps["captionStyle"];
}> = ({ captions, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  if (captions.length === 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380 }}>
      <div
        style={{
          maxWidth: 900,
          textAlign: "center",
          fontFamily: "sans-serif",
          fontWeight: 800,
          fontSize: style.fontSize,
          lineHeight: 1.25,
          color: style.color,
          textShadow: "0 4px 16px rgba(0,0,0,0.8)",
          whiteSpace: "pre-wrap",
        }}
      >
        {captions.map((c, i) => (
          <span key={i} style={{ color: nowMs >= c.startMs && nowMs < c.endMs ? style.highlightColor : undefined }}>
            {c.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** 숏폼 1개 = 장면 Sequence 의 연속. Player 미리보기와 서버 렌더가 동일 컴포넌트를 사용한다. */
export const ReelComposition: React.FC<ReelCompositionProps> = ({ scenes, captionStyle }) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {scenes.map((scene) => {
        const start = from;
        from += scene.durationInFrames;
        return (
          <Sequence key={scene.id} from={start} durationInFrames={scene.durationInFrames} name={scene.id}>
            <SceneVisualLayer scene={scene} />
            {scene.audioSrc ? <Html5Audio src={scene.audioSrc} /> : null}
            <CaptionLayer captions={scene.captions} style={captionStyle} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
