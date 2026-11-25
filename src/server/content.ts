import "server-only";
import { contentHash } from "../domain/hash";
import { ReelCompositionProps, secToFrames, type Caption } from "../domain/schemas";
import type { Database } from "./database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type SceneRow = Database["public"]["Tables"]["scenes"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

/** 대본 승인 단위. 승인 시 이 스냅샷이 approvals.snapshot 에 버전으로 보관된다. */
export type ScriptSnapshot = {
  title: string;
  caption: string;
  hashtags: string[];
  scenes: { id: string; narration: string; visualPrompt: string; durationSec: number }[];
};

export function buildScriptSnapshot(
  project: Pick<ProjectRow, "title" | "caption" | "hashtags">,
  scenes: Pick<SceneRow, "id" | "position" | "narration" | "visual_prompt" | "duration_sec">[],
): ScriptSnapshot {
  return {
    title: project.title,
    caption: project.caption,
    hashtags: [...project.hashtags],
    scenes: [...scenes]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        narration: s.narration,
        visualPrompt: s.visual_prompt,
        durationSec: Number(s.duration_sec),
      })),
  };
}

export function scriptContentHash(snapshot: ScriptSnapshot): string {
  return contentHash(snapshot);
}

// ---------------------------------------------------------------------------
// 장면 검수 스냅샷 (scenes 승인 단위)
// ---------------------------------------------------------------------------
export type ScenesSnapshot = {
  scenes: { id: string; visualPrompt: string; durationSec: number; visualAssetId: string | null; placeholder: unknown }[];
};

export function buildScenesSnapshot(scenes: SceneRow[]): ScenesSnapshot {
  return {
    scenes: [...scenes]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        visualPrompt: s.visual_prompt,
        durationSec: Number(s.duration_sec),
        visualAssetId: s.visual_asset_id,
        placeholder: s.visual_placeholder ?? null,
      })),
  };
}

// ---------------------------------------------------------------------------
// 최종 컴포지션 계획 (final 승인 단위 = 렌더 입력)
//  - 해시·승인 스냅샷은 asset id 기준 (서명 URL 은 매번 바뀌므로 제외)
//  - Player 미리보기와 서버 렌더는 resolveCompositionPlan() 결과(같은 props)를 사용
// ---------------------------------------------------------------------------
type AssetRef = { assetId: string; storagePath: string; mimeType: string };

export type CompositionPlan = {
  scenes: {
    id: string;
    durationMs: number;
    visual: { type: "placeholder"; color: string; label: string } | ({ type: "asset" } & AssetRef);
    audio: AssetRef | null;
    captions: Caption[];
  }[];
};

/** 나레이션이 장면 길이보다 길면 장면을 늘린다 (끝에 0.3초 여유) */
const NARRATION_TAIL_MS = 300;

export function buildCompositionPlan(scenes: SceneRow[], assets: Map<string, AssetRow>): CompositionPlan {
  return {
    scenes: [...scenes]
      .sort((a, b) => a.position - b.position)
      .map((s) => {
        const ph = s.visual_placeholder as { color?: string; label?: string } | null;
        const va = s.visual_asset_id ? assets.get(s.visual_asset_id) : undefined;
        const na = s.narration_asset_id ? assets.get(s.narration_asset_id) : undefined;
        const visual = va
          ? { type: "asset" as const, assetId: va.id, storagePath: va.storage_path, mimeType: va.mime_type }
          : { type: "placeholder" as const, color: ph?.color ?? "#111827", label: ph?.label ?? s.visual_prompt };
        const narrationMs = s.narration_duration_ms ?? 0;
        return {
          id: s.id,
          durationMs: Math.max(Math.round(Number(s.duration_sec) * 1000), narrationMs + NARRATION_TAIL_MS),
          visual,
          audio: na ? { assetId: na.id, storagePath: na.storage_path, mimeType: na.mime_type } : null,
          captions: (s.captions as Caption[] | null) ?? [],
        };
      }),
  };
}

export function compositionPlanHash(plan: CompositionPlan): string {
  // 저장 경로는 asset id 에 종속되므로 해시에서 제외해도 동일성이 유지된다
  return contentHash(
    plan.scenes.map((s) => ({
      id: s.id,
      durationMs: s.durationMs,
      visual: s.visual.type === "asset" ? { assetId: s.visual.assetId } : s.visual,
      audio: s.audio?.assetId ?? null,
      captions: s.captions,
    })),
  );
}

export function planStoragePaths(plan: CompositionPlan): string[] {
  return plan.scenes.flatMap((s) => [
    ...(s.visual.type === "asset" ? [s.visual.storagePath] : []),
    ...(s.audio ? [s.audio.storagePath] : []),
  ]);
}

/** 계획 + 서명 URL → Remotion 컴포지션 props (Player·렌더 공용) */
export function resolveCompositionPlan(plan: CompositionPlan, signed: Map<string, string>): ReelCompositionProps {
  const url = (path: string) => {
    const u = signed.get(path);
    if (!u) throw new Error(`서명 URL 없음: ${path}`);
    return u;
  };
  return ReelCompositionProps.parse({
    scenes: plan.scenes.map((s) => ({
      id: s.id,
      durationInFrames: secToFrames(s.durationMs / 1000),
      visual:
        s.visual.type === "asset"
          ? { type: s.visual.mimeType.startsWith("image/") ? "image" : "video", src: url(s.visual.storagePath) }
          : { type: "placeholder", color: s.visual.color, label: s.visual.label },
      audioSrc: s.audio ? url(s.audio.storagePath) : null,
      captions: s.captions,
    })),
  });
}
