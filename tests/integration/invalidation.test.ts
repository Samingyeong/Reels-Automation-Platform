import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { approveScript, createProject, editScript, getProjectDetail, requestScriptGeneration } from "../../src/server/project-service";
import { admin, createTestUser, getJobs, getProject, testDeps, type TestUser } from "../support/helpers";

let user: TestUser;
beforeAll(async () => {
  user = await createTestUser();
});

/**
 * M2~M4 의 단계(장면·나레이션·렌더·예약)는 아직 실행기가 없으므로, 대본 승인 이후 상태를
 * DB 픽스처로 만든 뒤 "이전 단계 수정 → 후속 무효화" 를 검증한다.
 */
async function projectInScheduledState() {
  const t = testDeps({ dispatch: "inline" });
  const { id } = await createProject(t.deps, user.userId, { topic: "무효화 검증" });
  await requestScriptGeneration(t.deps, user.userId, id, { revision: 0 });
  await t.flush();
  let detail = await getProjectDetail(user.db, id);
  await approveScript(t.deps, user.userId, id, { revision: detail.project.revision, contentHash: detail.contentHashes.script });
  detail = await getProjectDetail(user.db, id);

  const db = admin();
  // 장면 결과물 준비 완료로 가정 (mock placeholder)
  for (const s of detail.scenes) {
    await db
      .from("scenes")
      .update({ visual_status: "ready", visual_placeholder: { color: "#000", label: "x" }, narration_status: "ready", narration_duration_ms: 1000 })
      .eq("id", s.id);
  }
  // 장면·최종 승인, 렌더, 예약, 발행 작업
  await db.from("approvals").insert([
    { project_id: id, stage: "scenes", version: 1, content_hash: "a".repeat(64), approved_by: user.userId, snapshot: {} },
    { project_id: id, stage: "final", version: 1, content_hash: "b".repeat(64), approved_by: user.userId, snapshot: {} },
  ]);
  const { data: render } = await db
    .from("renders")
    .insert({ project_id: id, composition_hash: "b".repeat(64), input_props: {}, status: "succeeded" })
    .select("id")
    .single();
  const { data: account } = await db
    .from("instagram_accounts")
    .insert({ user_id: user.userId, ig_user_id: randomUUID(), username: "tester", access_token_secret_id: randomUUID() })
    .select("id")
    .single();
  await db.from("publications").insert({
    project_id: id,
    render_id: render!.id,
    instagram_account_id: account!.id,
    caption: "c",
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    is_live: false,
  });
  await db.from("jobs").insert({ project_id: id, kind: "publish", idempotency_key: `publish:${randomUUID()}` });
  await db.from("jobs").update({ status: "succeeded" }).eq("project_id", id).eq("kind", "scene_video");
  const p = await getProject(id);
  await db.from("projects").update({ status: "SCHEDULED" }).eq("id", id);
  return { t, id, revision: p.revision, scenes: detail.scenes, renderId: render!.id };
}

describe("이전 단계 수정 시 후속 승인·렌더·예약 무효화", () => {
  it("예약 상태에서 대본 수정 → 모든 승인 취소, 렌더 무효, 예약·발행 작업 취소, 수정된 장면만 stale", async () => {
    const { t, id, revision, scenes, renderId } = await projectInScheduledState();

    const script = {
      title: "수정된 제목",
      caption: "",
      hashtags: [],
      scenes: scenes.map((s, i) => ({
        id: s.id,
        narration: i === 1 ? `${s.narration} (수정)` : s.narration,
        visualPrompt: i === 0 ? `${s.visual_prompt} (수정)` : s.visual_prompt,
        durationSec: Number(s.duration_sec),
      })),
    };
    const r = await editScript(t.deps, user.userId, id, { revision, script });
    expect(r.status).toBe("SCRIPT_REVIEW");

    const db = admin();
    const { data: approvals } = await db.from("approvals").select("stage, revoked_at, revoked_reason").eq("project_id", id);
    expect(approvals!.every((a) => a.revoked_at !== null && a.revoked_reason === "EDIT_SCRIPT")).toBe(true);

    const { data: render } = await db.from("renders").select("is_current").eq("id", renderId).single();
    expect(render!.is_current).toBe(false);

    const { data: pubs } = await db.from("publications").select("status").eq("project_id", id);
    expect(pubs!.map((p) => p.status)).toEqual(["canceled"]);
    const publishJobs = (await getJobs(id)).filter((j) => j.kind === "publish");
    expect(publishJobs.every((j) => j.status === "canceled")).toBe(true);

    const { data: after } = await db.from("scenes").select("id, visual_status, narration_status").eq("project_id", id).order("position");
    expect(after![0]).toMatchObject({ visual_status: "stale", narration_status: "ready" });
    expect(after![1]).toMatchObject({ visual_status: "ready", narration_status: "stale" });
    expect(after!.slice(2).every((s) => s.visual_status === "ready" && s.narration_status === "ready")).toBe(true);

    // 이벤트 감사 로그
    const { data: events } = await db.from("project_events").select("event, from_status, to_status").eq("project_id", id).order("id", { ascending: false }).limit(1);
    expect(events![0]).toMatchObject({ event: "EDIT_SCRIPT", from_status: "SCHEDULED", to_status: "SCRIPT_REVIEW" });
  });

  it("재승인하면 대본 승인 v2 가 새 스냅샷으로 기록되고 v1 은 보존된다", async () => {
    const { t, id, revision, scenes } = await projectInScheduledState();
    const script = {
      title: "v2",
      caption: "",
      hashtags: [],
      scenes: scenes.map((s) => ({ id: s.id, narration: s.narration, visualPrompt: s.visual_prompt, durationSec: Number(s.duration_sec) })),
    };
    await editScript(t.deps, user.userId, id, { revision, script });
    const detail = await getProjectDetail(user.db, id);
    await approveScript(t.deps, user.userId, id, { revision: detail.project.revision, contentHash: detail.contentHashes.script });

    const { data: versions } = await admin()
      .from("approvals")
      .select("version, revoked_at, snapshot")
      .eq("project_id", id)
      .eq("stage", "script")
      .order("version");
    expect(versions!.map((v) => v.version)).toEqual([1, 2]);
    expect(versions![0].revoked_at).not.toBeNull();
    expect(versions![1].revoked_at).toBeNull();
    expect((versions![1].snapshot as { title: string }).title).toBe("v2");

    // 내용이 바뀌지 않은 장면은 이미 ready → 새 장면 작업을 만들지 않는다 (비용 중복 방지)
    const newSceneJobs = (await getJobs(id)).filter((j) => j.kind === "scene_video" && j.status === "queued");
    expect(newSceneJobs).toHaveLength(0);
  });
});
