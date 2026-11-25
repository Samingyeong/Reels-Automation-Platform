import { beforeAll, describe, expect, it } from "vitest";
import { createAsyncMockSceneVideoProvider, createMockProviders, MOCK_FAIL_FATAL } from "../../src/providers/mock";
import {
  approveFinal,
  approveScenes,
  approveScript,
  createProject,
  getProjectDetail,
  regenerateNarration,
  regenerateScene,
  requestScriptGeneration,
  retryFailedStep,
} from "../../src/server/project-service";
import { MEDIA_BUCKET } from "../../src/server/storage";
import { admin, createTestUser, getJobs, getProject, testDeps, type TestUser } from "../support/helpers";

let user: TestUser;
beforeAll(async () => {
  user = await createTestUser();
});

async function detail(id: string) {
  return getProjectDetail(user.db, id);
}

/** 대본 생성 → 승인 → 장면 생성 완료까지 */
async function toScenesReview(t: ReturnType<typeof testDeps>, topic = "파이프라인") {
  const { id } = await createProject(t.deps, user.userId, { topic, targetDurationSec: 12 });
  await requestScriptGeneration(t.deps, user.userId, id, { revision: 0 });
  await t.flush();
  const d = await detail(id);
  await approveScript(t.deps, user.userId, id, { revision: d.project.revision, contentHash: d.contentHashes.script });
  await t.flush();
  return id;
}

describe("M2 파이프라인: 장면 → 나레이션 → 최종 렌더 (Mock provider)", () => {
  it("전체 흐름 + 특정 장면만 수정·재생성 + 나레이션 문구 수정 + Storage 저장", async () => {
    const t = testDeps({ dispatch: "inline" });
    const id = await toScenesReview(t);
    let d = await detail(id);
    expect(d.project.status).toBe("SCENES_REVIEW");
    expect(d.scenes.every((s) => s.visual_status === "ready" && s.visual_placeholder)).toBe(true);

    // 1) 두 번째 장면만 프롬프트 수정 후 재생성 → 그 장면만 새 작업, 나머지 결과 유지
    const [s0, s1] = d.scenes;
    const beforeOther = s0.visual_placeholder;
    const regen = await regenerateScene(t.deps, user.userId, id, s1.id, {
      revision: d.project.revision,
      visualPrompt: `${s1.visual_prompt} at night`,
    });
    expect(regen.jobIds).toHaveLength(1);
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("SCENES_REVIEW");
    expect(d.scenes[1].visual_prompt).toContain("at night");
    expect(d.scenes[0].visual_placeholder).toEqual(beforeOther);
    const sceneJobs = (await getJobs(id)).filter((j) => j.kind === "scene_video");
    expect(sceneJobs.filter((j) => j.scene_id === s1.id)).toHaveLength(2);
    expect(sceneJobs.filter((j) => j.scene_id === s0.id)).toHaveLength(1);

    // 2) 장면 승인 → 나레이션: WAV 가 Storage 에 저장되고 자막 타이밍이 생성됨
    await approveScenes(t.deps, user.userId, id, { revision: d.project.revision, contentHash: d.contentHashes.scenes });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("FINAL_REVIEW");
    for (const s of d.scenes) {
      expect(s.narration_status).toBe("ready");
      expect(s.narration_audio_url).toMatch(/^http/);
      expect((s.captions as unknown[]).length).toBeGreaterThan(0);
    }
    const { data: files } = await admin().storage.from(MEDIA_BUCKET).list(`${user.userId}/${id}/narration_audio`);
    expect(files?.length).toBe(d.scenes.length);
    expect(d.preview?.scenes).toHaveLength(d.scenes.length);
    expect(d.contentHashes.final).toMatch(/^[0-9a-f]{64}$/);

    // 3) 특정 장면 나레이션 문구만 수정 → 그 장면만 TTS 재생성
    const oldAudio = d.scenes[2].narration_asset_id;
    await regenerateNarration(t.deps, user.userId, id, d.scenes[2].id, {
      revision: d.project.revision,
      narration: "마지막 문장을 바꿨습니다",
    });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("FINAL_REVIEW");
    expect(d.scenes[2].narration).toBe("마지막 문장을 바꿨습니다");
    expect(d.scenes[2].narration_asset_id).not.toBe(oldAudio);
    expect(d.scenes[0].narration_asset_id).not.toBeNull();

    // 4) 최종 승인 → 렌더 → MP4 Storage 저장 + RENDERED
    await approveFinal(t.deps, user.userId, id, { revision: d.project.revision, contentHash: d.contentHashes.final });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("RENDERED");
    expect(d.render).toMatchObject({ status: "succeeded" });
    expect(d.render?.videoUrl).toMatch(/^http/);
    const { data: approvals } = await admin().from("approvals").select("stage").eq("project_id", id).is("revoked_at", null);
    expect(approvals!.map((a) => a.stage).sort()).toEqual(["final", "scenes", "script"]);

    // 5) 렌더 완료 후 장면 하나 재생성 요청 → 장면 검수로 복귀, 장면·최종 승인과 렌더 무효화
    await regenerateScene(t.deps, user.userId, id, d.scenes[0].id, { revision: d.project.revision });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("SCENES_REVIEW");
    expect(d.render).toBeNull(); // 현재 렌더 없음 (이전 렌더는 is_current=false)
    expect(d.activeApprovals.map((a) => a.stage)).toEqual(["script"]);
  });

  it("오래된 해시로 장면 승인 → CONTENT_CHANGED, 준비 안 된 상태 승인 불가", async () => {
    const t = testDeps({ dispatch: "inline" });
    const id = await toScenesReview(t, "해시");
    const d = await detail(id);
    await expect(
      approveScenes(t.deps, user.userId, id, { revision: d.project.revision, contentHash: "f".repeat(64) }),
    ).rejects.toMatchObject({ code: "CONTENT_CHANGED" });
    await expect(
      approveFinal(t.deps, user.userId, id, { revision: d.project.revision, contentHash: "f".repeat(64) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("비동기 영상 provider: externalJobId 를 저장하고 폴링해 완료", async () => {
    const providers = { ...createMockProviders(), sceneVideo: createAsyncMockSceneVideoProvider({ pollsUntilDone: 2 }) };
    const t = testDeps({ dispatch: "inline", providers });
    t.runnerDeps.pollIntervalMs = 1;
    const id = await toScenesReview(t, "비동기");
    expect((await getProject(id)).status).toBe("SCENES_REVIEW");
    const jobs = (await getJobs(id)).filter((j) => j.kind === "scene_video");
    expect(jobs.every((j) => j.external_job_id?.startsWith("mockjob_") && j.status === "succeeded")).toBe(true);
  });

  it("장면 하나가 영구 실패하면 SCENES_FAILED, 수정 후 그 장면만 재생성해 복구", async () => {
    const t = testDeps({ dispatch: "inline" });
    const { id } = await createProject(t.deps, user.userId, { topic: "실패 복구", targetDurationSec: 12 });
    await requestScriptGeneration(t.deps, user.userId, id, { revision: 0 });
    await t.flush();
    let d = await detail(id);
    // 두 번째 장면 프롬프트에 장애 주입 표식
    const script = {
      title: d.project.title,
      caption: d.project.caption,
      hashtags: d.project.hashtags,
      scenes: d.scenes.map((s, i) => ({
        id: s.id,
        narration: s.narration,
        visualPrompt: i === 1 ? `${s.visual_prompt} ${MOCK_FAIL_FATAL}` : s.visual_prompt,
        durationSec: Number(s.duration_sec),
      })),
    };
    const { editScript } = await import("../../src/server/project-service");
    await editScript(t.deps, user.userId, id, { revision: d.project.revision, script });
    d = await detail(id);
    await approveScript(t.deps, user.userId, id, { revision: d.project.revision, contentHash: d.contentHashes.script });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("SCENES_FAILED");
    expect(d.scenes.map((s) => s.visual_status)).toEqual(["ready", "failed", "ready"]);

    await regenerateScene(t.deps, user.userId, id, d.scenes[1].id, { revision: d.project.revision, visualPrompt: "fixed prompt" });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("SCENES_REVIEW");
    expect(d.scenes.every((s) => s.visual_status === "ready")).toBe(true);
  });

  it("렌더 실패 → RENDER_FAILED(렌더 레코드 failed) → RETRY 로 복구", async () => {
    let fail = true;
    const t = testDeps({
      dispatch: "inline",
      renderer: async (props) => {
        if (fail) throw new Error("chromium crashed");
        return { data: new Uint8Array([1, 2, 3]), durationMs: props.scenes.length * 1000, mimeType: "video/mp4" };
      },
    });
    const id = await toScenesReview(t, "렌더 실패");
    let d = await detail(id);
    await approveScenes(t.deps, user.userId, id, { revision: d.project.revision, contentHash: d.contentHashes.scenes });
    await t.flush();
    d = await detail(id);
    await approveFinal(t.deps, user.userId, id, { revision: d.project.revision, contentHash: d.contentHashes.final });
    await t.flush(); // 재시도 지연 0 → inline 이 setTimeout 으로 다시 전달
    for (let i = 0; i < 50 && (await getProject(id)).status === "RENDERING"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      await t.flush();
    }
    d = await detail(id);
    expect(d.project.status).toBe("RENDER_FAILED");
    expect(d.project.last_error).toContain("chromium crashed");
    expect(d.render?.status).toBe("failed");

    fail = false;
    await retryFailedStep(t.deps, user.userId, id, { revision: d.project.revision });
    await t.flush();
    d = await detail(id);
    expect(d.project.status).toBe("RENDERED");
    expect(d.render?.status).toBe("succeeded");
  });
});
