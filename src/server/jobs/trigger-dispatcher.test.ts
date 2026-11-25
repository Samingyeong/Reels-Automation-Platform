import { beforeEach, describe, expect, it, vi } from "vitest";

const trigger = vi.fn(async (...args: [id: string, payload?: unknown, opts?: unknown]) => ({ id: `run_${args[0]}` }));
const create = vi.fn(async (key: string, opts: { scope: string }) => `hashed(${key}|${opts.scope})`);
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger }, idempotencyKeys: { create } }));

const { TriggerDispatcher } = await import("./trigger-dispatcher");

function fakeDb(jobs: { id: string; kind: string; attempt: number; dispatch_attempts: number }[]) {
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const db = {
    rpc,
    from: () => ({ select: () => ({ in: async () => ({ data: jobs, error: null }) }) }),
  };
  return { db: db as never, rpc };
}

describe("TriggerDispatcher", () => {
  beforeEach(() => {
    trigger.mockClear();
    create.mockClear();
  });

  it("렌더는 render-job, 나머지는 pipeline-job 으로 전달하고 run id 를 기록한다", async () => {
    const { db, rpc } = fakeDb([
      { id: "j1", kind: "scene_video", attempt: 0, dispatch_attempts: 0 },
      { id: "j2", kind: "render", attempt: 1, dispatch_attempts: 2 },
    ]);
    await new TriggerDispatcher(db).dispatch(["j1", "j2"]);
    expect(trigger.mock.calls.map((c) => c[0])).toEqual(["pipeline-job", "render-job"]);
    expect(trigger.mock.calls[0][1]).toEqual({ jobId: "j1" });
    expect(rpc).toHaveBeenCalledWith("mark_job_dispatched", { p_job_id: "j2", p_run_id: "run_render-job" });
  });

  it("멱등 키는 global scope, 시도·전달 횟수가 바뀌면 다른 키", async () => {
    const { db } = fakeDb([{ id: "j1", kind: "script", attempt: 2, dispatch_attempts: 3 }]);
    await new TriggerDispatcher(db).dispatch(["j1"]);
    expect(create).toHaveBeenCalledWith("job:j1:a2:d3", { scope: "global" });
    expect((trigger.mock.calls[0] as unknown[])[2]).toMatchObject({ idempotencyKey: "hashed(job:j1:a2:d3|global)" });
  });

  it("빈 목록은 아무것도 하지 않는다", async () => {
    const { db } = fakeDb([]);
    await new TriggerDispatcher(db).dispatch([]);
    expect(trigger).not.toHaveBeenCalled();
  });
});
