import { describe, expect, it } from "vitest";
import { transition } from "../domain/pipeline";
import { effectsToOps, type OpsContext } from "./ops";

const scene = (id: string, over: Partial<OpsContext["scenes"][number]> = {}) => ({
  id,
  visualPrompt: `prompt ${id}`,
  durationSec: 3,
  narration: `n ${id}`,
  visualStatus: "pending",
  narrationStatus: "pending",
  ...over,
});
const ctx = (over: Partial<OpsContext> = {}): OpsContext => ({
  projectId: "p1",
  nextRevision: 5,
  scenes: [scene("s1"), scene("s2", { visualStatus: "ready" })],
  providerNames: { script: "mock-script", sceneVideo: "mock-scene-video", speech: "mock-speech" },
  voiceId: "v",
  language: "ko",
  ...over,
});

function effects(from: Parameters<typeof transition>[0], e: Parameters<typeof transition>[1]) {
  const r = transition(from, e);
  if (!r.ok) throw new Error(r.reason);
  return r.effects;
}

describe("effectsToOps", () => {
  it("대본 승인: 승인 기록 + ready 가 아닌 장면만 enqueue", () => {
    const ops = effectsToOps(effects("SCRIPT_REVIEW", { type: "APPROVE_SCRIPT" }), {
      ...ctx(),
      approval: { contentHash: "h", snapshot: { a: 1 } },
    });
    expect(ops[0]).toEqual({ op: "record_approval", stage: "script", contentHash: "h", snapshot: { a: 1 } });
    const enq = ops.filter((o) => o.op === "enqueue");
    expect(enq).toHaveLength(1);
    expect(enq[0]).toMatchObject({ kind: "scene_video", sceneId: "s1" });
  });

  it("승인 스냅샷 없이 RECORD_APPROVAL 은 오류", () => {
    expect(() => effectsToOps(effects("SCRIPT_REVIEW", { type: "APPROVE_SCRIPT" }), ctx())).toThrow();
  });

  it("장면 멱등 키: 같은 입력이면 같은 키, 프롬프트가 바뀌면 다른 키", () => {
    const e = effects("SCENES_REVIEW", { type: "REGENERATE_SCENES", sceneIds: ["s1"] });
    const k1 = effectsToOps(e, ctx()).find((o) => o.op === "enqueue");
    const k2 = effectsToOps(e, ctx({ nextRevision: 99 })).find((o) => o.op === "enqueue");
    const k3 = effectsToOps(e, ctx({ scenes: [scene("s1", { visualPrompt: "changed" })] })).find((o) => o.op === "enqueue");
    expect(k1).toEqual(k2);
    expect(k1).not.toEqual(k3);
  });

  it("대본 생성 키는 revision 마다 달라 재생성 요청이 새 결과를 만든다", () => {
    const e = effects("SCRIPT_REVIEW", { type: "GENERATE_SCRIPT" });
    const a = effectsToOps(e, ctx({ nextRevision: 2 })).find((o) => o.op === "enqueue");
    const b = effectsToOps(e, ctx({ nextRevision: 3 })).find((o) => o.op === "enqueue");
    expect(a).not.toEqual(b);
  });

  it("예약 상태 수정 → 승인 취소·렌더 무효·예약 취소 op", () => {
    const ops = effectsToOps(effects("SCHEDULED", { type: "EDIT_SCRIPT" }), ctx()).map((o) => o.op);
    expect(ops).toEqual(["revoke_approvals", "invalidate_render", "cancel_scheduled_publication"]);
  });
});
