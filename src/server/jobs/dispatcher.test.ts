import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { HoldKindsDispatcher } = await import("./dispatcher");

describe("HoldKindsDispatcher (cloud 임시 실행 모드)", () => {
  it("render 작업은 전달하지 않고 나머지만 전달한다", async () => {
    const rows = [
      { id: "a", kind: "script" },
      { id: "b", kind: "render" },
      { id: "c", kind: "narration" },
    ];
    const db = { from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }) };
    const inner = { name: "inline", dispatch: vi.fn(async () => {}) };
    const d = new HoldKindsDispatcher(db as never, inner, ["render"]);
    await d.dispatch(["a", "b", "c"]);
    expect(inner.dispatch).toHaveBeenCalledWith(["a", "c"]);
    expect(d.name).toBe("inline+hold(render)");
  });
});
