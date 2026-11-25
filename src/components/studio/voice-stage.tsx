"use client";

import { useEffect, useState } from "react";
import { Check, Mic, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { SceneThumb } from "./scene-thumb";
import { isBusy } from "./status";
import type { Act } from "./studio";
import type { ProjectDetail, SceneDetail } from "./types";

/** 나레이션·자막 검수 + 최종 미리보기 승인 (워크플로 5·6단계, docs/03 §1) */
export function VoiceStage({
  data,
  act,
  pending,
  selectedId,
  onSelect,
}: {
  data: ProjectDetail;
  act: Act;
  pending: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { project, scenes } = data;
  const reviewing = project.status === "FINAL_REVIEW";
  const ready = scenes.length > 0 && scenes.every((s) => s.narration_status === "ready");

  return (
    <div className="space-y-4" data-testid="voice-stage">
      <ol className="space-y-3">
        {scenes.map((s, i) => (
          <VoiceRow
            key={`${s.id}:${project.revision}`}
            scene={s}
            index={i}
            data={data}
            act={act}
            pending={pending}
            selected={selectedId === s.id}
            onSelect={() => onSelect(s.id)}
          />
        ))}
      </ol>
      {reviewing ? (
        <div className="flex flex-col items-end gap-2">
          <p className="text-xs text-muted-foreground">오른쪽 미리보기 그대로 MP4 로 렌더됩니다.</p>
          <Button
            data-testid="approve-final"
            size="lg"
            disabled={pending || !ready || !data.contentHashes.final}
            onClick={() =>
              act("최종 승인했습니다. MP4 를 렌더링합니다", () =>
                api(`/api/projects/${project.id}/final/approve`, {
                  body: { revision: project.revision, contentHash: data.contentHashes.final },
                }),
              )
            }
          >
            <Check /> 최종 승인하고 MP4 렌더
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VoiceRow({
  scene,
  index,
  data,
  act,
  pending,
  selected,
  onSelect,
}: {
  scene: SceneDetail;
  index: number;
  data: ProjectDetail;
  act: Act;
  pending: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { project } = data;
  const [text, setText] = useState(scene.narration);
  useEffect(() => setText(scene.narration), [scene.narration]);
  const busy = isBusy(project.status);
  const changed = text.trim() !== scene.narration;
  const captions = (scene.captions as { text: string }[] | null) ?? [];

  return (
    <li
      data-testid="voice-row"
      data-narration-status={scene.narration_status}
      className={cn("grid grid-cols-[64px_1fr] gap-3 rounded-2xl border bg-card p-3", selected && "border-primary/60")}
    >
      <button type="button" onClick={onSelect} aria-label={`장면 ${index + 1} 미리보기`}>
        <SceneThumb scene={scene} index={index} part="narration" />
      </button>
      <div className="min-w-0 space-y-2">
        <Textarea
          data-testid="voice-text"
          aria-label={`장면 ${index + 1} 나레이션`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          className="min-h-14 resize-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Mic className="size-3.5 shrink-0" />
            {scene.narration_audio_url ? (
              <audio src={scene.narration_audio_url} controls controlsList="nodownload" className="h-7 max-w-52" />
            ) : (
              <span>{scene.narration_status === "generating" ? "음성 생성 중…" : "음성 없음"}</span>
            )}
            {scene.narration_duration_ms ? <span className="tabular-nums">{(scene.narration_duration_ms / 1000).toFixed(1)}초</span> : null}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={changed ? "default" : "ghost"}
              data-testid="regenerate-narration"
              disabled={pending || busy || !text.trim()}
              onClick={() =>
                act(`장면 ${index + 1} 나레이션을 다시 만드는 중입니다`, () =>
                  api(`/api/projects/${project.id}/scenes/${scene.id}/narration`, {
                    body: { revision: project.revision, ...(changed ? { narration: text.trim() } : {}) },
                  }),
                )
              }
            >
              <RefreshCw /> {changed ? "수정한 문장으로 다시 녹음" : "다시 녹음"}
            </Button>
          </div>
        </div>
        {captions.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground" title="자막 단어 타이밍">
            자막: {captions.map((c) => c.text).join("")}
          </p>
        ) : null}
      </div>
    </li>
  );
}
