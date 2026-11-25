import { describe, expect, it } from "vitest";
import {
  aggregateSceneStatuses,
  invalidatedApprovals,
  isWorkerOnlyEvent,
  PROJECT_STATUSES,
  transition,
  type PipelineEvent,
  type ProjectStatus,
  type SideEffect,
} from "./pipeline";

function run(from: ProjectStatus, ...events: PipelineEvent[]): ProjectStatus {
  let s = from;
  for (const e of events) {
    const r = transition(s, e);
    if (!r.ok) throw new Error(r.reason);
    s = r.to;
  }
  return s;
}

function effectsOf(from: ProjectStatus, e: PipelineEvent): SideEffect[] {
  const r = transition(from, e);
  if (!r.ok) throw new Error(r.reason);
  return r.effects;
}

describe("happy path", () => {
  it("대본 → 장면 → 나레이션 → 렌더 → 예약 → 발행", () => {
    const final = run(
      "DRAFT",
      { type: "GENERATE_SCRIPT" },
      { type: "SCRIPT_SUCCEEDED" },
      { type: "APPROVE_SCRIPT" },
      { type: "SCENES_SUCCEEDED" },
      { type: "APPROVE_SCENES" },
      { type: "NARRATION_SUCCEEDED" },
      { type: "APPROVE_FINAL" },
      { type: "RENDER_SUCCEEDED" },
      { type: "SCHEDULE" },
      { type: "PUBLISH_STARTED" },
      { type: "PUBLISH_SUCCEEDED" },
    );
    expect(final).toBe("PUBLISHED");
  });
});

describe("승인 없이 다음 단계로 진행할 수 없다", () => {
  it("대본 검수 중 장면 생성 완료 이벤트는 거부", () => {
    expect(transition("SCRIPT_REVIEW", { type: "SCENES_SUCCEEDED" }).ok).toBe(false);
  });
  it("장면 검수 상태에서 렌더 승인 불가", () => {
    expect(transition("SCENES_REVIEW", { type: "APPROVE_FINAL" }).ok).toBe(false);
  });
  it("렌더 전 예약 불가", () => {
    expect(transition("FINAL_REVIEW", { type: "SCHEDULE" }).ok).toBe(false);
  });
  it("모든 상태에서 승인 이벤트는 해당 검수 상태에서만 허용된다", () => {
    const gates: Array<[PipelineEvent["type"], ProjectStatus]> = [
      ["APPROVE_SCRIPT", "SCRIPT_REVIEW"],
      ["APPROVE_SCENES", "SCENES_REVIEW"],
      ["APPROVE_FINAL", "FINAL_REVIEW"],
    ];
    for (const [type, allowed] of gates) {
      for (const s of PROJECT_STATUSES) {
        const r = transition(s, { type } as PipelineEvent);
        expect(r.ok, `${type} @ ${s}`).toBe(s === allowed);
      }
    }
  });
});

describe("수정 시 후속 승인 초기화", () => {
  it("invalidatedApprovals 는 자신과 이후 단계를 반환", () => {
    expect(invalidatedApprovals("script")).toEqual(["script", "scenes", "final"]);
    expect(invalidatedApprovals("scenes")).toEqual(["scenes", "final"]);
    expect(invalidatedApprovals("final")).toEqual(["final"]);
  });

  it("렌더 완료 후 대본 수정 → 대본 검수로 복귀, 모든 승인·렌더 무효", () => {
    const r = transition("RENDERED", { type: "EDIT_SCRIPT" });
    expect(r).toMatchObject({ ok: true, to: "SCRIPT_REVIEW" });
    if (!r.ok) return;
    expect(r.effects).toContainEqual({
      type: "REVOKE_APPROVALS",
      stages: ["script", "scenes", "final"],
    });
    expect(r.effects).toContainEqual({ type: "INVALIDATE_RENDER" });
  });

  it("예약 상태에서 장면 수정 → 예약 취소 + 장면 승인 이후 초기화", () => {
    const effects = effectsOf("SCHEDULED", { type: "EDIT_SCENE", sceneId: "s2" });
    expect(effects).toContainEqual({ type: "CANCEL_SCHEDULED_PUBLICATION" });
    expect(effects).toContainEqual({ type: "REVOKE_APPROVALS", stages: ["scenes", "final"] });
    expect(effects).toContainEqual({ type: "MARK_SCENES_STALE", sceneIds: ["s2"], part: "visual" });
  });

  it("자막 수정은 final 승인만 초기화", () => {
    const effects = effectsOf("FINAL_REVIEW", { type: "EDIT_CAPTIONS" });
    expect(effects).toEqual([{ type: "REVOKE_APPROVALS", stages: ["final"] }]);
  });

  it("생성·렌더·발행 진행 중에는 수정 불가", () => {
    for (const s of [
      "SCRIPT_GENERATING",
      "SCENES_GENERATING",
      "NARRATION_GENERATING",
      "RENDERING",
      "PUBLISHING",
      "PUBLISHED",
    ] as ProjectStatus[]) {
      expect(transition(s, { type: "EDIT_SCRIPT" }).ok, s).toBe(false);
      expect(transition(s, { type: "EDIT_SCENE", sceneId: "x" }).ok, s).toBe(false);
      expect(transition(s, { type: "EDIT_CAPTIONS" }).ok, s).toBe(false);
    }
  });
});

describe("특정 장면만 재생성", () => {
  it("선택한 장면만 큐에 넣는다", () => {
    const effects = effectsOf("SCENES_REVIEW", { type: "REGENERATE_SCENES", sceneIds: ["s3"] });
    expect(effects).toContainEqual({ type: "ENQUEUE", job: "scene_video", sceneIds: ["s3"] });
  });
  it("빈 목록은 거부", () => {
    expect(transition("SCENES_REVIEW", { type: "REGENERATE_SCENES", sceneIds: [] }).ok).toBe(false);
  });
  it("장면 집계", () => {
    expect(aggregateSceneStatuses(["ready", "generating"])).toBe("in_progress");
    expect(aggregateSceneStatuses(["ready", "ready"])).toBe("succeeded");
    expect(aggregateSceneStatuses(["ready", "failed"])).toBe("failed");
    expect(aggregateSceneStatuses(["ready", "stale"])).toBe("failed");
    expect(aggregateSceneStatuses([])).toBe("failed");
  });
});

describe("실패와 재시도", () => {
  it.each([
    ["SCRIPT_FAILED", "SCRIPT_GENERATING"],
    ["SCENES_FAILED", "SCENES_GENERATING"],
    ["NARRATION_FAILED", "NARRATION_GENERATING"],
    ["RENDER_FAILED", "RENDERING"],
  ] as const)("%s → %s", (from, to) => {
    expect(transition(from, { type: "RETRY" })).toMatchObject({ ok: true, to });
  });

  it("발행 실패는 자동 재시도하지 않고 재예약을 요구한다 (중복 게시 방지)", () => {
    expect(transition("PUBLISH_FAILED", { type: "RETRY" }).ok).toBe(false);
    expect(transition("PUBLISH_FAILED", { type: "SCHEDULE" })).toMatchObject({
      ok: true,
      to: "SCHEDULED",
    });
  });

  it("성공 상태는 워커 이벤트로만 도달", () => {
    expect(isWorkerOnlyEvent("PUBLISH_SUCCEEDED")).toBe(true);
    expect(isWorkerOnlyEvent("RENDER_SUCCEEDED")).toBe(true);
    expect(isWorkerOnlyEvent("APPROVE_FINAL")).toBe(false);
  });

  it("PUBLISHED 는 종단 상태", () => {
    const allEvents: PipelineEvent[] = [
      { type: "EDIT_SCRIPT" },
      { type: "SCHEDULE" },
      { type: "PUBLISH_STARTED" },
      { type: "PUBLISH_SUCCEEDED" },
      { type: "RETRY" },
      { type: "CANCEL_SCHEDULE" },
    ];
    for (const e of allEvents) expect(transition("PUBLISHED", e).ok, e.type).toBe(false);
  });
});
