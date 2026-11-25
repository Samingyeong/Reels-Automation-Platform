import { AlertTriangle, Loader2, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SceneDetail } from "./types";

type Part = "visual" | "narration";

/** 장면 썸네일: Mock 은 색 배경 placeholder, 실제 provider 결과는 영상 첫 프레임 */
export function SceneThumb({ scene, index, part = "visual", className }: { scene: SceneDetail; index: number; part?: Part; className?: string }) {
  const status = part === "visual" ? scene.visual_status : scene.narration_status;
  const ph = scene.visual_placeholder as { color?: string; label?: string } | null;
  return (
    <div
      className={cn("relative aspect-[9/16] overflow-hidden rounded-lg bg-muted", className)}
      style={ph?.color ? { backgroundColor: ph.color } : undefined}
    >
      {scene.visual_url && scene.visual_mime?.startsWith("video/") ? (
        <video src={scene.visual_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : null}
      <span className="absolute top-1.5 left-1.5 rounded-md bg-black/55 px-1.5 text-[11px] font-semibold text-white tabular-nums">
        {index + 1}
      </span>
      {ph && !scene.visual_url ? (
        <span className="absolute right-1 bottom-1 rounded bg-black/40 px-1 text-[9px] font-medium tracking-wide text-white/80">MOCK</span>
      ) : null}
      {status === "generating" || status === "pending" ? (
        <div className="absolute inset-0 grid place-items-center bg-black/55">
          <Loader2 className="size-5 animate-spin text-white" />
        </div>
      ) : status === "failed" ? (
        <div className="absolute inset-0 grid place-items-center bg-status-failed/35">
          <AlertTriangle className="size-5 text-white" />
        </div>
      ) : status === "stale" ? (
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          <PencilLine className="size-5 text-white" />
        </div>
      ) : null}
    </div>
  );
}
