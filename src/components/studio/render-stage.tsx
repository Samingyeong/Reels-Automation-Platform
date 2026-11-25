import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import type { ProjectDetail } from "./types";

function formatBytes(n: number | null) {
  if (!n) return "-";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/** 최종 MP4: 사용자가 파일을 내려받지 않고, Storage 에 저장된 결과를 그대로 다음 단계(예약 발행)에 쓴다 */
export function RenderStage({ data }: { data: ProjectDetail }) {
  const { project, render } = data;
  if (project.status === "RENDERING") {
    return (
      <div data-testid="render-progress" className="flex items-center gap-3 rounded-2xl border bg-card p-5">
        <Loader2 className="size-5 animate-spin text-status-busy" />
        <div>
          <p className="font-medium">승인한 미리보기 그대로 MP4 를 렌더링하고 있습니다</p>
          <p className="text-sm text-muted-foreground">창을 닫아도 서버에서 계속 진행됩니다. 1080×1920 · 30fps · H.264/AAC</p>
        </div>
      </div>
    );
  }
  if (project.status === "RENDERED" && render?.status === "succeeded") {
    return (
      <div data-testid="render-done" className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-status-done/30 bg-status-done/10 p-5">
          <CheckCircle2 className="size-6 text-status-done" />
          <div>
            <p className="font-medium">MP4 렌더 완료 — 서버 Storage 에 저장되었습니다</p>
            <p className="text-sm text-muted-foreground">
              {render.durationMs ? `${(render.durationMs / 1000).toFixed(1)}초` : "-"} · {formatBytes(render.sizeBytes)} · Instagram Reels 규격
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
          <CalendarClock className="size-5" />
          예약 발행은 다음 단계(M4: Instagram 연동)에서 이 화면에 추가됩니다. 파일을 내려받을 필요가 없습니다.
        </div>
      </div>
    );
  }
  return null;
}
