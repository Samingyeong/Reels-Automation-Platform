import { beforeAll, describe, expect, it } from "vitest";
import { GET as getProject } from "../../src/app/api/projects/[id]/route";
import { POST as approve } from "../../src/app/api/projects/[id]/script/approve/route";
import { POST as generate } from "../../src/app/api/projects/[id]/script/generate/route";
import { GET as listProjects, POST as createProject } from "../../src/app/api/projects/route";
import { createTestUser, type TestUser } from "../support/helpers";

/** Route Handler 를 직접 호출한다 (JOB_DISPATCH_MODE=none: 작업은 outbox 에만 기록). */
let user: TestUser;
beforeAll(async () => {
  user = await createTestUser();
});

function req(method: string, body?: unknown, token: string | null = user.accessToken) {
  return new Request("http://localhost/api", {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("API routes", () => {
  it("인증 없으면 401", async () => {
    const res = await listProjects(req("GET", undefined, null), params(""));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("위조 토큰은 401", async () => {
    const res = await listProjects(req("GET", undefined, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad"), params(""));
    expect(res.status).toBe(401);
  });

  it("생성 201 → 조회 → 대본 생성 202 → 잘못된 전이 409 → 입력 오류 400", async () => {
    const created = await createProject(req("POST", { topic: "API 테스트" }), params(""));
    expect(created.status).toBe(201);
    const { id, revision } = await created.json();

    const detail = await getProject(req("GET"), params(id));
    expect(detail.status).toBe(200);
    expect((await detail.json()).project.status).toBe("DRAFT");

    const gen = await generate(req("POST", { revision }), params(id));
    expect(gen.status).toBe(202);
    const g = await gen.json();
    expect(g).toMatchObject({ status: "SCRIPT_GENERATING", revision: revision + 1 });

    // 생성 중에는 승인 불가
    const bad = await approve(req("POST", { revision: g.revision, contentHash: "0".repeat(64) }), params(id));
    expect(bad.status).toBe(409);
    expect((await bad.json()).error.code).toBe("INVALID_TRANSITION");

    const invalid = await generate(req("POST", { revision: "x" }), params(id));
    expect(invalid.status).toBe(400);

    const list = await listProjects(req("GET"), params(""));
    expect((await list.json()).map((p: { id: string }) => p.id)).toContain(id);
  });

  it("존재하지 않거나 형식이 틀린 id 는 404", async () => {
    const res = await generate(req("POST", { revision: 0 }), params("not-a-uuid"));
    expect(res.status).toBe(404);
  });
});
