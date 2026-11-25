"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { isBusy } from "./status";
import type { Act } from "./studio";
import type { ProjectDetail } from "./types";

type DraftScene = { id?: string; narration: string; visualPrompt: string; durationSec: number };
type Draft = { title: string; caption: string; hashtags: string; scenes: DraftScene[] };

function fromDetail(d: ProjectDetail): Draft {
  return {
    title: d.project.title,
    caption: d.project.caption,
    hashtags: d.project.hashtags.join(" "),
    scenes: d.scenes.map((s) => ({
      id: s.id,
      narration: s.narration,
      visualPrompt: s.visual_prompt,
      durationSec: Number(s.duration_sec),
    })),
  };
}

function toScript(draft: Draft) {
  return {
    title: draft.title.trim() || "제목 없음",
    caption: draft.caption,
    hashtags: draft.hashtags.split(/\s+/).filter(Boolean).slice(0, 30),
    scenes: draft.scenes.map((s) => ({ ...s, narration: s.narration.trim(), visualPrompt: s.visualPrompt.trim() })),
  };
}

const storageKey = (id: string, revision: number) => `reels:draft:${id}:r${revision}`;

/**
 * 대본 검수·편집. 저장하지 않은 수정은 브라우저에 보관해 새로고침해도 유지한다 (같은 revision 기준).
 * 승인 이후 단계에서 수정하면 서버가 후속 승인·렌더를 초기화하고 대본 검수로 되돌린다.
 */
export function ScriptStage({ data, act, pending }: { data: ProjectDetail; act: Act; pending: boolean }) {
  const { project } = data;
  const base = useMemo(() => fromDetail(data), [data]);
  const key = storageKey(project.id, project.revision);
  const [draft, setDraft] = useState<Draft>(base);

  // revision 이 바뀌면(서버 반영) 서버 값으로 초기화, 같은 revision 의 저장 안 한 초안이 있으면 복원
  useEffect(() => {
    let restored: Draft | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) restored = JSON.parse(raw) as Draft;
    } catch {
      restored = null;
    }
    setDraft(restored ?? base);
  }, [key, base]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(key, JSON.stringify(draft));
      else localStorage.removeItem(key);
    } catch {
      /* 저장소를 쓸 수 없는 환경에서는 보관하지 않는다 */
    }
  }, [dirty, draft, key]);

  const busy = isBusy(project.status);
  const canEdit = !busy && project.status !== "DRAFT" && project.status !== "SCRIPT_FAILED";
  const reviewing = project.status === "SCRIPT_REVIEW";
  const total = draft.scenes.reduce((s, x) => s + (Number(x.durationSec) || 0), 0);
  const valid = draft.scenes.length > 0 && draft.scenes.every((s) => s.narration.trim() && s.visualPrompt.trim() && s.durationSec >= 1);

  const update = (i: number, patch: Partial<DraftScene>) =>
    setDraft((d) => ({ ...d, scenes: d.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const save = () =>
    act("대본을 저장했습니다", () =>
      api(`/api/projects/${project.id}/script`, { method: "PUT", body: { revision: project.revision, script: toScript(draft) } }),
    );

  const approve = () =>
    act("대본을 승인했습니다. 장면을 만드는 중입니다", async () => {
      let revision = project.revision;
      let hash = data.contentHashes.script;
      if (dirty) {
        await api(`/api/projects/${project.id}/script`, { method: "PUT", body: { revision, script: toScript(draft) } });
        const fresh = await api<ProjectDetail>(`/api/projects/${project.id}`);
        revision = fresh.project.revision;
        hash = fresh.contentHashes.script;
      }
      await api(`/api/projects/${project.id}/script/approve`, { body: { revision, contentHash: hash } });
    });

  if (project.status === "DRAFT" || project.status === "SCRIPT_GENERATING") {
    return (
      <div className="space-y-3" data-testid="script-generating">
        <p className="text-sm text-muted-foreground">AI 가 장면별 대본을 쓰고 있습니다…</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="script-stage">
      {!reviewing && canEdit ? (
        <p className="rounded-xl border border-status-review/30 bg-status-review/10 px-4 py-3 text-sm text-status-review">
          이미 승인한 대본입니다. 수정해 저장하면 이후 단계의 승인과 렌더 결과가 초기화되고, 바뀐 장면만 다시 생성됩니다.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          aria-label="제목"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          disabled={!canEdit}
          className="h-11 text-lg font-semibold"
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {draft.scenes.length}개 장면 · 약 {Math.round(total)}초
        </div>
      </div>

      <ol className="space-y-3">
        {draft.scenes.map((s, i) => (
          <li key={s.id ?? `new-${i}`} data-testid="script-scene" className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">장면 {i + 1}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  길이
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    step={0.5}
                    value={s.durationSec}
                    onChange={(e) => update(i, { durationSec: Number(e.target.value) })}
                    disabled={!canEdit}
                    className="h-7 w-16 text-right"
                  />
                  초
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`장면 ${i + 1} 삭제`}
                  disabled={!canEdit || draft.scenes.length <= 1}
                  onClick={() => setDraft((d) => ({ ...d, scenes: d.scenes.filter((_, j) => j !== i) }))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">나레이션 (말할 문장)</span>
                <Textarea
                  data-testid="scene-narration"
                  value={s.narration}
                  onChange={(e) => update(i, { narration: e.target.value })}
                  disabled={!canEdit}
                  className="min-h-20 resize-none"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">화면 (영상 생성 프롬프트)</span>
                <Textarea
                  data-testid="scene-visual"
                  value={s.visualPrompt}
                  onChange={(e) => update(i, { visualPrompt: e.target.value })}
                  disabled={!canEdit}
                  className="min-h-20 resize-none"
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      {canEdit ? (
        <Button
          variant="outline"
          className="w-full border-dashed"
          disabled={draft.scenes.length >= 20}
          onClick={() =>
            setDraft((d) => ({ ...d, scenes: [...d.scenes, { narration: "", visualPrompt: "", durationSec: 3 }] }))
          }
        >
          <Plus /> 장면 추가
        </Button>
      ) : null}

      <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">게시물 캡션</span>
          <Textarea
            value={draft.caption}
            onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
            disabled={!canEdit}
            maxLength={2200}
            className="min-h-16 resize-none"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">해시태그 (공백으로 구분, 최대 30개)</span>
          <Input
            value={draft.hashtags}
            onChange={(e) => setDraft((d) => ({ ...d, hashtags: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
      </div>

      {canEdit ? (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 bg-gradient-to-t from-background via-background to-transparent px-1 pt-6 pb-2">
          {reviewing ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                act("대본을 다시 쓰는 중입니다", () =>
                  api(`/api/projects/${project.id}/script/generate`, { body: { revision: project.revision } }),
                )
              }
            >
              <RotateCcw /> 다시 쓰기
            </Button>
          ) : null}
          <Button variant="secondary" disabled={pending || !dirty || !valid} onClick={save}>
            <Save /> 변경 저장
          </Button>
          {reviewing ? (
            <Button data-testid="approve-script" size="lg" disabled={pending || !valid} onClick={approve}>
              <Check /> 대본 승인하고 장면 만들기
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
