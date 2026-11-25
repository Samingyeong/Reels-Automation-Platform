import { Check, Lock } from "lucide-react";
import type { ProjectStatus } from "@/domain/pipeline";
import { cn } from "@/lib/utils";
import { isBusy, isFailed, STAGES, stageIndex, stageOf, type StageKey } from "./status";

/** 제작 단계 레일. 지난 단계는 눌러서 다시 열 수 있고(수정 시 이후 승인 초기화), 다음 단계는 잠겨 있다. */
export function StageRail({
  status,
  view,
  onView,
}: {
  status: ProjectStatus;
  view: StageKey;
  onView: (k: StageKey) => void;
}) {
  const current = stageIndex(stageOf(status));
  const done = status === "RENDERED" || status === "PUBLISHED";
  return (
    <nav aria-label="제작 단계" className="flex gap-1 overflow-x-auto lg:flex-col">
      {STAGES.map((s, i) => {
        const state = i < current || (done && i === current) ? "done" : i === current ? "active" : "locked";
        return (
          <button
            key={s.key}
            type="button"
            data-testid={`stage-${s.key}`}
            data-state={state}
            disabled={state === "locked"}
            aria-current={view === s.key ? "step" : undefined}
            onClick={() => onView(s.key)}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left whitespace-nowrap transition-colors lg:shrink lg:whitespace-normal",
              view === s.key ? "bg-accent" : "hover:bg-accent/60",
              state === "locked" && "opacity-45 hover:bg-transparent",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                state === "done" && "border-status-done bg-status-done/15 text-status-done",
                state === "active" && isFailed(status) && "border-status-failed text-status-failed",
                state === "active" && !isFailed(status) && (isBusy(status) ? "border-status-busy text-status-busy" : "border-primary text-primary"),
              )}
            >
              {state === "done" ? <Check className="size-3.5" /> : state === "locked" ? <Lock className="size-3" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{s.label}</span>
              <span className="hidden truncate text-xs text-muted-foreground lg:block">{s.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
