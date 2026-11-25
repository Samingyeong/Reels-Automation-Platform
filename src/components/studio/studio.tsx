"use client";

import Link from "next/link";
import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { secToFrames, type ReelCompositionProps } from "@/domain/schemas";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PreviewPane, type PreviewContent } from "./preview-pane";
import { RenderStage } from "./render-stage";
import { ScenesStage } from "./scenes-stage";
import { ScriptStage } from "./script-stage";
import { StageRail } from "./stage-rail";
import { isBusy, isFailed, stageOf, type StageKey } from "./status";
import { StatusPill } from "./status-pill";
import type { ProjectDetail, SceneDetail } from "./types";
import { useProject } from "./use-project";
import { VoiceStage } from "./voice-stage";

/** 사용자 작업 실행: 성공/실패 안내 후 서버 상태를 다시 읽는다 */
export type Act = (successMessage: string, fn: () => Promise<unknown>) => void;

type Toast = { tone: "ok" | "error"; message: string } | null;

const CAPTION_STYLE = { fontSize: 64, color: "#ffffff", highlightColor: "#ffd400" };

function scenePreviewProps(scene: SceneDetail): ReelCompositionProps | null {
  if (scene.visual_status !== "ready") return null;
  const ph = scene.visual_placeholder as { color: string; label: string } | null;
  const visual = scene.visual_url
    ? { type: scene.visual_mime?.startsWith("image/") ? ("image" as const) : ("video" as const), src: scene.visual_url }
    : ph
      ? { type: "placeholder" as const, color: ph.color, label: ph.label }
      : null;
  if (!visual) return null;
  return {
    captionStyle: CAPTION_STYLE,
    scenes: [{ id: scene.id, durationInFrames: secToFrames(Number(scene.duration_sec)), visual, audioSrc: null, captions: [] }],
  };
}

/**
 * 폴링할 때마다 서명 URL 이 새로 발급되므로, 최종 컴포지션 해시가 같으면 이전 미리보기 props 를 재사용해
 * 재생 중인 Player 가 다시 로드되지 않게 한다.
 */
function useStablePreview(detail: ProjectDetail): ProjectDetail {
  const hash = detail.contentHashes.final;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 해시가 바뀔 때만 새 props 를 쓴다 (의도적)
  const preview = useMemo(() => detail.preview, [hash]);
  return useMemo(() => ({ ...detail, preview }), [detail, preview]);
}

export function Studio({ initial, initialSceneId, mock }: { initial: ProjectDetail; initialSceneId: string | null; mock: boolean }) {
  const { data, refresh } = useProject(initial.project.id, initial);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<Toast>(null);
  const playerRef = useRef<PlayerRef>(null);

  const detail = useStablePreview(data ?? initial);
  const { project, scenes } = detail;
  const current = stageOf(project.status);

  // 보고 있는 단계: 기본은 현재 단계, 상태가 다른 단계로 넘어가면 자동으로 따라간다
  const [viewState, setViewState] = useState<{ view: StageKey; at: StageKey }>({ view: current, at: current });
  const view = viewState.at === current ? viewState.view : current;

  // 선택한 장면은 URL(?scene=) 에 보관 → 새로고침해도 유지
  const [selectedId, setSelectedId] = useState<string | null>(initialSceneId);
  const selected = scenes.find((s) => s.id === selectedId) ?? scenes[0] ?? null;
  const selectScene = useCallback((id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("scene", id);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const act: Act = useCallback(
    (successMessage, fn) =>
      startTransition(async () => {
        try {
          await fn();
          setToast({ tone: "ok", message: successMessage });
        } catch (e) {
          const message =
            e instanceof ApiError && e.code === "REVISION_CONFLICT"
              ? "다른 곳에서 먼저 변경되었습니다. 최신 상태로 새로고침했습니다."
              : e instanceof Error
                ? e.message
                : "요청에 실패했습니다.";
          setToast({ tone: "error", message });
        }
        await refresh();
      }),
    [refresh],
  );

  // 나레이션 단계에서 장면을 고르면 전체 미리보기를 그 장면 시작으로 이동
  const sceneStartFrame = useMemo(() => {
    const starts = new Map<string, number>();
    let f = 0;
    for (const s of detail.preview?.scenes ?? []) {
      starts.set(s.id, f);
      f += s.durationInFrames;
    }
    return starts;
  }, [detail.preview]);
  const onVoiceSelect = (id: string) => {
    selectScene(id);
    const frame = sceneStartFrame.get(id);
    if (frame !== undefined) playerRef.current?.seekTo(frame);
  };

  const preview: PreviewContent = useMemo(() => {
    const busy = isBusy(project.status);
    if (view === "render" && detail.render?.videoUrl && project.status === "RENDERED") {
      return { kind: "video", url: detail.render.videoUrl, caption: "렌더된 MP4 (Storage 저장본)" };
    }
    if (view === "render" && project.status === "RENDERING") return { kind: "busy", caption: "MP4 렌더링 중…" };
    if (view === "scenes") {
      const props = selected ? scenePreviewProps(selected) : null;
      if (props) return { kind: "composition", props, caption: `장면 ${scenes.indexOf(selected!) + 1} 미리보기` };
      return busy ? { kind: "busy", caption: "장면 영상 생성 중…" } : { kind: "empty", caption: "장면을 선택하세요" };
    }
    if (detail.preview) {
      return { kind: "composition", props: detail.preview, caption: "나레이션·자막 포함 최종 미리보기 — 이대로 렌더됩니다" };
    }
    if (busy) return { kind: "busy", caption: view === "script" ? "대본 작성 중…" : "나레이션 생성 중…" };
    return { kind: "empty", caption: "대본을 승인하면 장면 영상이 여기에 나타납니다" };
  }, [view, project.status, detail.preview, detail.render, selected, scenes]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/85 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" aria-label="프로젝트 목록" />}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold" data-testid="project-title">
            {project.title || project.topic}
          </h1>
        </div>
        {mock ? (
          <Badge variant="outline" className="border-status-review/40 text-status-review" title="유료 API 를 호출하지 않는 Mock provider 결과입니다">
            MOCK
          </Badge>
        ) : null}
        <StatusPill status={project.status} />
      </header>

      <div className="grid flex-1 gap-6 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)_360px] lg:px-6">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <StageRail status={project.status} view={view} onView={(k) => setViewState({ view: k, at: current })} />
        </aside>

        <main className="min-w-0 space-y-4" data-testid="stage-panel" data-pending={pending ? "true" : "false"}>
          {isFailed(project.status) ? (
            <div data-testid="failure-banner" className="flex flex-wrap items-center gap-3 rounded-2xl border border-status-failed/40 bg-status-failed/10 p-4">
              <AlertTriangle className="size-5 shrink-0 text-status-failed" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">생성에 실패했습니다</p>
                <p className="text-sm break-words text-muted-foreground">{project.last_error ?? "알 수 없는 오류"}</p>
              </div>
              <Button
                data-testid="retry"
                variant="secondary"
                disabled={pending}
                onClick={() => act("다시 시도하는 중입니다", () => api(`/api/projects/${project.id}/retry`, { body: { revision: project.revision } }))}
              >
                <RotateCcw /> 다시 시도
              </Button>
            </div>
          ) : null}

          {view === "script" ? (
            <ScriptStage data={detail} act={act} pending={pending} />
          ) : view === "scenes" ? (
            <ScenesStage data={detail} act={act} pending={pending} selected={selected} onSelect={selectScene} />
          ) : view === "voice" ? (
            <VoiceStage mock={mock} data={detail} act={act} pending={pending} selectedId={selected?.id ?? null} onSelect={onVoiceSelect} />
          ) : (
            <RenderStage data={detail} />
          )}
        </main>

        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <PreviewPane content={preview} playerRef={playerRef} />
        </aside>
      </div>

      {toast ? (
        <div
          role="status"
          data-testid="toast"
          className={cn(
            "fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm shadow-lg",
            toast.tone === "ok" ? "bg-foreground text-background" : "bg-destructive text-white",
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
