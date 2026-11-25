"use client";

import dynamic from "next/dynamic";
import type { PlayerRef } from "@remotion/player";
import type { Ref } from "react";
import { Film, Loader2 } from "lucide-react";
import type { ReelCompositionProps } from "@/domain/schemas";

// Remotion Player 는 무겁고 브라우저 전용 → 지연 로드 (bundle-dynamic-imports)
const PreviewPlayer = dynamic(() => import("./preview-player").then((m) => m.PreviewPlayer), {
  ssr: false,
  loading: () => <Loader2 className="size-6 animate-spin text-muted-foreground" />,
});

export type PreviewContent =
  | { kind: "composition"; props: ReelCompositionProps; caption: string }
  | { kind: "video"; url: string; caption: string }
  | { kind: "busy"; caption: string }
  | { kind: "empty"; caption: string };

export function PreviewPane({ content, playerRef }: { content: PreviewContent; playerRef?: Ref<PlayerRef> }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        data-testid="preview-frame"
        data-kind={content.kind}
        className="relative grid aspect-[9/16] w-full max-w-[340px] place-items-center overflow-hidden rounded-[28px] border-[6px] border-black bg-stage shadow-2xl shadow-black/50"
      >
        {content.kind === "composition" ? (
          <PreviewPlayer ref={playerRef} props={content.props} />
        ) : content.kind === "video" ? (
          // 다운로드 UI 없이 재생만 (파일은 서버 Storage 에서 바로 발행 단계로 전달된다)
          <video
            data-testid="final-video"
            src={content.url}
            controls
            playsInline
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            className="h-full w-full object-contain"
          />
        ) : content.kind === "busy" ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-status-busy" />
            {content.caption}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <Film className="size-6" />
            {content.caption}
          </div>
        )}
      </div>
      {content.kind === "composition" || content.kind === "video" ? (
        <p className="text-center text-xs text-muted-foreground">{content.caption}</p>
      ) : null}
    </div>
  );
}
