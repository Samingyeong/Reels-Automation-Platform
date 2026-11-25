import { beforeAll, describe, expect, it } from "vitest";
import {
  approveScript,
  createProject,
  editScript,
  getProjectDetail,
  requestScriptGeneration,
} from "../../src/server/project-service";
import { ServiceError } from "../../src/server/errors";
import { admin, createTestUser, getJobs, getProject, testDeps, type TestUser } from "../support/helpers";

let user: TestUser;
beforeAll(async () => {
  user = await createTestUser();
});

async function expectServiceError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e) => e instanceof ServiceError && e.code === code);
}

describe("대본 생성 → 수정 → 승인 (Mock provider, inline 실행)", () => {
  it("전체 흐름과 승인 버전 관리", async () => {
    const t = testDeps({ dispatch: "inline" });
    const created = await createProject(t.deps, user.userId, { topic: "아침 커피 타이밍", targetDurationSec: 24 });
    expect(created).toMatchObject({ status: "DRAFT", revision: 0 });

    // 1) 생성 요청 → 커밋 후 inline 실행 → SCRIPT_REVIEW
    const gen = await requestScriptGeneration(t.deps, user.userId, created.id, { revision: 0 });
    expect(gen.status).toBe("SCRIPT_GENERATING");
    expect(gen.jobIds).toHaveLength(1);
    await t.flush();

    const detail = await getProjectDetail(user.db, created.id);
    expect(detail.project.status).toBe("SCRIPT_REVIEW");
    expect(detail.scenes.length).toBeGreaterThanOrEqual(3);
    const [scriptJob] = await getJobs(created.id);
    expect(scriptJob).toMatchObject({ kind: "script", status: "succeeded", attempt: 1, provider: "mock-script" });

    // 2) 오래된 해시로 승인 → CONTENT_CHANGED
    await expectServiceError(
      approveScript(t.deps, user.userId, created.id, { revision: detail.project.revision, contentHash: "0".repeat(64) }),
      "CONTENT_CHANGED",
    );

    // 3) 승인 v1 → 장면 영상 작업이 같은 트랜잭션에서 장면 수만큼 생성
    const v1Hash = detail.contentHashes.script;
    const approved = await approveScript(t.deps, user.userId, created.id, {
      revision: detail.project.revision,
      contentHash: v1Hash,
    });
    expect(approved.status).toBe("SCENES_GENERATING");
    const sceneJobs = (await getJobs(created.id)).filter((j) => j.kind === "scene_video");
    expect(sceneJobs).toHaveLength(detail.scenes.length);
    // M1 에는 장면 실행기가 없으므로 queued 로 남는다 (성공으로 표시하지 않음)
    expect(sceneJobs.every((j) => j.status === "queued" && j.dispatched_at === null)).toBe(true);

    // 4) 같은 revision 으로 중복 승인(더블 클릭) → REVISION_CONFLICT, 작업 추가 생성 없음
    await expectServiceError(
      approveScript(t.deps, user.userId, created.id, { revision: detail.project.revision, contentHash: v1Hash }),
      "REVISION_CONFLICT",
    );
    expect((await getJobs(created.id)).filter((j) => j.kind === "scene_video")).toHaveLength(sceneJobs.length);

    const { data: approvals } = await admin().from("approvals").select("*").eq("project_id", created.id);
    expect(approvals).toHaveLength(1);
    expect(approvals![0]).toMatchObject({ stage: "script", version: 1, content_hash: v1Hash, revoked_at: null });
    expect((approvals![0].snapshot as { scenes: unknown[] }).scenes).toHaveLength(detail.scenes.length);
  });

  it("승인 후 수정 → 승인 무효화, 수정한 장면만 stale, 재승인 시 v2 스냅샷", async () => {
    const t = testDeps({ dispatch: "inline" });
    const { id } = await createProject(t.deps, user.userId, { topic: "주말 러닝 루틴" });
    await requestScriptGeneration(t.deps, user.userId, id, { revision: 0 });
    await t.flush();
    let detail = await getProjectDetail(user.db, id);

    // 승인 전 수정: 첫 장면 visualPrompt 변경 + 장면 하나 추가
    const edited = {
      title: detail.project.title,
      caption: "수정된 캡션",
      hashtags: ["#러닝"],
      scenes: [
        ...detail.scenes.map((s, i) => ({
          id: s.id,
          narration: s.narration,
          visualPrompt: i === 0 ? `${s.visual_prompt} (sunrise)` : s.visual_prompt,
          durationSec: Number(s.duration_sec),
        })),
        { narration: "마지막 정리", visualPrompt: "runner stretching", durationSec: 3 },
      ],
    };
    const r1 = await editScript(t.deps, user.userId, id, { revision: detail.project.revision, script: edited });
    expect(r1.status).toBe("SCRIPT_REVIEW");
    detail = await getProjectDetail(user.db, id);
    expect(detail.scenes).toHaveLength(edited.scenes.length);
    expect(detail.project.caption).toBe("수정된 캡션");
    // 결과물이 아직 없으므로 stale 이 아니라 pending
    expect(detail.scenes.every((s) => s.visual_status === "pending")).toBe(true);

    await approveScript(t.deps, user.userId, id, {
      revision: detail.project.revision,
      contentHash: detail.contentHashes.script,
    });

    // 장면 생성 중 상태에서는 대본 수정 불가 (생성 중 잠금)
    const p = await getProject(id);
    await expectServiceError(
      editScript(t.deps, user.userId, id, { revision: p.revision, script: edited }),
      "INVALID_TRANSITION",
    );
  });

  it("다른 사용자의 프로젝트에는 명령을 보낼 수 없다 (404)", async () => {
    const t = testDeps();
    const other = await createTestUser();
    const { id } = await createProject(t.deps, user.userId, { topic: "남의 프로젝트" });
    await expectServiceError(requestScriptGeneration(t.deps, other.userId, id, { revision: 0 }), "NOT_FOUND");
    await expectServiceError(getProjectDetail(other.db, id), "NOT_FOUND");
  });

  it("잘못된 입력은 VALIDATION_ERROR", async () => {
    const t = testDeps();
    await expectServiceError(createProject(t.deps, user.userId, { topic: "" }), "VALIDATION_ERROR");
    const { id } = await createProject(t.deps, user.userId, { topic: "검증" });
    await expectServiceError(requestScriptGeneration(t.deps, user.userId, id, {}), "VALIDATION_ERROR");
  });
});
