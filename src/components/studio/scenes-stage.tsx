"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { SceneThumb } from "./scene-thumb";
import { isBusy } from "./status";
import type { Act } from "./studio";
import type { ProjectDetail, SceneDetail } from "./types";

const PART_LABEL: Record<string, string> = {
  pending: "대기",
  generating: "생성 중",
  ready: "완료",
  failed: "실패",
  stale: "수정됨",
};

/** 장면 영상 검수: 장면을 골라 그 장면만 프롬프트 수정·재생성 */
export function ScenesStage({
  data,
  act,
  pending,
  selected,
  onSelect,
}: {
  data: ProjectDetail;
  act: Act;
  pending: boolean;
  selected: SceneDetail | null;
  onSelect: (id: string) => void;
}) {
  const { project, scenes } = data;
  const reviewing = project.status === "SCENES_REVIEW";
  const allReady = scenes.length > 0 && scenes.every((s) => s.visual_status === "ready");

  return (
    <div className="space-y-5" data-testid="scenes-stage">
      <ol className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {scenes.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              data-testid="scene-card"
              data-scene-status={s.visual_status}
              aria-pressed={selected?.id === s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "w-full rounded-xl p-1 text-left ring-2 ring-transparent transition",
                selected?.id === s.id ? "ring-primary" : "hover:ring-border",
              )}
            >
              <SceneThumb scene={s} index={i} />
              <p className="mt-1.5 line-clamp-2 px-0.5 text-xs text-muted-foreground">{s.visual_prompt}</p>
            </button>
          </li>
        ))}
      </ol>

      {selected ? (
        <SceneInspector
          key={`${selected.id}:${project.revision}`}
          scene={selected}
          index={scenes.findIndex((s) => s.id === selected.id)}
          data={data}
          act={act}
          pending={pending}
        />
      ) : null}

      {reviewing ? (
        <div className="flex justify-end">
          <Button
            data-testid="approve-scenes"
            size="lg"
            disabled={pending || !allReady}
            onClick={() =>
              act("장면을 승인했습니다. 나레이션을 만드는 중입니다", () =>
                api(`/api/projects/${project.id}/scenes/approve`, {
                  body: { revision: project.revision, contentHash: data.contentHashes.scenes },
                }),
              )
            }
          >
            <Check /> 장면 승인하고 나레이션 만들기
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SceneInspector({
  scene,
  index,
  data,
  act,
  pending,
}: {
  scene: SceneDetail;
  index: number;
  data: ProjectDetail;
  act: Act;
  pending: boolean;
}) {
  const { project } = data;
  const [prompt, setPrompt] = useState(scene.visual_prompt);
  const [duration, setDuration] = useState(Number(scene.duration_sec));
  useEffect(() => {
    setPrompt(scene.visual_prompt);
    setDuration(Number(scene.duration_sec));
  }, [scene.visual_prompt, scene.duration_sec]);

  const busy = isBusy(project.status);
  const afterGate = !["SCENES_REVIEW", "SCENES_FAILED", "SCENES_GENERATING"].includes(project.status);
  const changed = prompt.trim() !== scene.visual_prompt || duration !== Number(scene.duration_sec);

  return (
    <section data-testid="scene-inspector" className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">장면 {index + 1}</h3>
        <span className="text-xs text-muted-foreground">영상 · {PART_LABEL[scene.visual_status]}</span>
      </div>
      <p className="mb-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">“{scene.narration}”</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Textarea
          data-testid="inspector-prompt"
          aria-label="화면 프롬프트"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          className="min-h-20 resize-none"
        />
        <label className="flex items-start gap-1.5 text-xs text-muted-foreground sm:flex-col">
          길이(초)
          <Input
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={busy}
            className="h-8 w-20 text-right"
          />
        </label>
      </div>
      {afterGate ? (
        <p className="mt-3 text-xs text-status-review">이 장면을 다시 만들면 장면·최종 승인과 렌더 결과가 초기화됩니다.</p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button
          data-testid="regenerate-scene"
          variant={changed ? "default" : "secondary"}
          disabled={pending || busy || !prompt.trim()}
          onClick={() =>
            act(`장면 ${index + 1}을 다시 만드는 중입니다`, () =>
              api(`/api/projects/${project.id}/scenes/${scene.id}/regenerate`, {
                body: {
                  revision: project.revision,
                  ...(changed ? { visualPrompt: prompt.trim(), durationSec: duration } : {}),
                },
              }),
            )
          }
        >
          <RefreshCw /> {changed ? "수정해서 이 장면만 다시 생성" : "이 장면만 다시 생성"}
        </Button>
      </div>
    </section>
  );
}
