import type { ProjectStatus } from "@/domain/pipeline";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, statusTone } from "./status";

const TONE = {
  busy: "bg-status-busy/15 text-status-busy",
  review: "bg-status-review/15 text-status-review",
  done: "bg-status-done/15 text-status-done",
  failed: "bg-status-failed/15 text-status-failed",
  idle: "bg-muted text-muted-foreground",
} as const;

export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      data-testid="status-pill"
      data-status={status}
      className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", TONE[tone], className)}
    >
      <span className={cn("size-1.5 rounded-full bg-current", tone === "busy" && "animate-pulse")} />
      {STATUS_LABEL[status]}
    </span>
  );
}
