import "server-only";
import { contentHash } from "../domain/hash";
import type { Database } from "./database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type SceneRow = Database["public"]["Tables"]["scenes"]["Row"];

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
