import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createProject } from "../../src/server/project-service";
import { admin, anonClient, createTestUser, testDeps, type TestUser } from "../support/helpers";

let alice: TestUser;
let bob: TestUser;
let projectId: string;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
  ({ id: projectId } = await createProject(testDeps().deps, alice.userId, { topic: "RLS" }));
  await admin()
    .from("instagram_accounts")
    .insert({ user_id: alice.userId, ig_user_id: randomUUID(), username: "alice", access_token_secret_id: randomUUID() });
});

describe("사용자별 데이터 접근 권한 (RLS + GRANT)", () => {
  it("소유자는 자기 프로젝트를 조회할 수 있다", async () => {
    const { data, error } = await alice.db.from("projects").select("id").eq("id", projectId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("다른 사용자는 조회할 수 없다 (0행)", async () => {
    const { data, error } = await bob.db.from("projects").select("id").eq("id", projectId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("anon 은 테이블 접근 권한 자체가 없다", async () => {
    const { error } = await anonClient().from("projects").select("id");
    expect(error?.code).toBe("42501");
  });

  it("사용자는 테이블에 직접 쓸 수 없다 (쓰기는 서버 RPC 로만)", async () => {
    const ins = await alice.db.from("projects").insert({ user_id: alice.userId, topic: "x" });
    expect(ins.error?.code).toBe("42501");
    const upd = await alice.db.from("projects").update({ status: "PUBLISHED" }).eq("id", projectId);
    expect(upd.error?.code).toBe("42501");
  });

  it("사용자·anon 은 상태 전이 RPC 를 호출할 수 없다", async () => {
    const args = {
      p_project_id: projectId,
      p_actor_user_id: alice.userId,
      p_actor: "user",
      p_event: "X",
      p_expected_status: "DRAFT" as const,
      p_expected_revision: 0,
      p_to_status: "PUBLISHED" as const,
    };
    for (const client of [alice.db, anonClient()]) {
      const { error } = await client.rpc("apply_transition", args);
      expect(error?.code).toBe("42501");
    }
    const { error } = await alice.db.rpc("claim_job", { p_job_id: randomUUID() });
    expect(error?.code).toBe("42501");
  });

  it("Instagram 토큰 secret id 컬럼은 소유자에게도 노출되지 않는다", async () => {
    const ok = await alice.db.from("instagram_accounts").select("username");
    expect(ok.data).toEqual([{ username: "alice" }]);
    const denied = await alice.db.from("instagram_accounts").select("access_token_secret_id");
    expect(denied.error?.code).toBe("42501");
  });

  it("service_role 이라도 소유자가 아닌 사용자 id 로는 전이할 수 없다", async () => {
    const { error } = await admin().rpc("apply_transition", {
      p_project_id: projectId,
      p_actor_user_id: bob.userId,
      p_actor: `user:${bob.userId}`,
      p_event: "GENERATE_SCRIPT",
      p_expected_status: "DRAFT",
      p_expected_revision: 0,
      p_to_status: "SCRIPT_GENERATING",
    });
    expect(error?.message).toContain("PROJECT_NOT_FOUND");
  });
});
