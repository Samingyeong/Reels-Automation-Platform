import { beforeAll, describe, expect, it } from "vitest";
import { createMockProviders } from "../../src/providers/mock";
import { ProviderError, type Providers } from "../../src/providers/types";
import { drainOutbox, InlineDispatcher } from "../../src/server/jobs/dispatcher";
import { runJob } from "../../src/server/jobs/runner";
import { createProject, requestScriptGeneration, retryFailedStep } from "../../src/server/project-service";
import { admin, createTestUser, getJobs, getProject, testDeps, type TestUser } from "../support/helpers";

let user: TestUser;
beforeAll(async () => {
  user = await createTestUser();
});

function providersWith(script: Pick<Providers["script"], "name" | "generateScript">): Providers {
  const base = createMockProviders();
  return { ...base, script: { ...base.script, ...script } };
}

/** 생성 요청까지만 하고 작업은 실행하지 않은 상태 (dispatcher=none) */
async function queuedScriptJob(providers?: Providers) {
  const t = testDeps({ dispatch: "none", providers });
  const { id } = await createProject(t.deps, user.userId, { topic: "작업 테스트" });
  const { jobIds } = await requestScriptGeneration(t.deps, user.userId, id, { revision: 0 });
  return { t, id, jobId: jobIds[0] };
}

describe("작업 실행: 중복 방지 · 재시도 · 실패 복구 · outbox", () => {
  it("같은 작업이 동시에 두 번 실행되어도 provider 는 한 번만 호출된다", async () => {
    let calls = 0;
    const base = createMockProviders().script;
    const providers = providersWith({
      name: "mock-script",
      async generateScript(input) {
        calls++;
        await new Promise((r) => setTimeout(r, 100));
        return base.generateScript(input);
      },
    });
    const { t, id, jobId } = await queuedScriptJob(providers);
    const deps = { ...t.runnerDeps, providers };
    const results = await Promise.all([runJob(deps, jobId), runJob(deps, jobId)]);
    expect(results.map((r) => r.status).sort()).toEqual(["skipped", "succeeded"]);
    expect(calls).toBe(1);
    expect((await getProject(id)).status).toBe("SCRIPT_REVIEW");
    // 완료된 작업을 다시 실행해도 아무 일도 일어나지 않는다
    expect((await runJob(deps, jobId)).status).toBe("skipped");
  });

  it("일시적 오류는 재시도하고, 시도 횟수를 소진하면 SCRIPT_FAILED (성공으로 표시하지 않음)", async () => {
    const providers = providersWith({
      name: "mock-script",
      async generateScript() {
        throw new ProviderError("upstream 503", { provider: "mock-script", retryable: true });
      },
    });
    const { t, id, jobId } = await queuedScriptJob(providers);
    const deps = { ...t.runnerDeps, providers };
    expect(await runJob(deps, jobId)).toMatchObject({ status: "retry_scheduled" });
    expect(await runJob(deps, jobId)).toMatchObject({ status: "retry_scheduled" });
    expect(await runJob(deps, jobId)).toMatchObject({ status: "failed" });

    const project = await getProject(id);
    expect(project.status).toBe("SCRIPT_FAILED");
    expect(project.last_error).toContain("upstream 503");
    const [job] = await getJobs(id);
    expect(job).toMatchObject({ status: "failed", attempt: 3, error_retryable: true });
  });

  it("재시도 불가 오류(스키마 불일치 응답)는 즉시 실패, RETRY 로 복구", async () => {
    const broken = providersWith({
      name: "mock-script",
      async generateScript() {
        return { title: "", scenes: [] } as never; // Script 스키마 위반
      },
    });
    const { id, jobId, t } = await queuedScriptJob(broken);
    expect(await runJob({ ...t.runnerDeps, providers: broken }, jobId)).toMatchObject({ status: "failed" });
    let project = await getProject(id);
    expect(project.status).toBe("SCRIPT_FAILED");
    expect(project.last_error).toContain("응답 형식 오류");

    // 사용자가 재시도 → 새 작업(새 멱등 키) → 정상 provider 로 성공
    const ok = testDeps({ dispatch: "inline" });
    const retried = await retryFailedStep(ok.deps, user.userId, id, { revision: project.revision });
    expect(retried.status).toBe("SCRIPT_GENERATING");
    await ok.flush();
    project = await getProject(id);
    expect(project.status).toBe("SCRIPT_REVIEW");
    expect(project.last_error).toBeNull();
    const jobs = await getJobs(id);
    expect(jobs.map((j) => j.status)).toEqual(["failed", "succeeded"]);
  });

  it("작업 생성 후 프로젝트가 바뀌면 결과를 버리고 작업을 취소한다", async () => {
    const { t, id, jobId } = await queuedScriptJob();
    // 다른 전이가 먼저 일어난 상황을 revision 증가로 모사
    const p = await getProject(id);
    await admin().from("projects").update({ revision: p.revision + 1 }).eq("id", id);
    expect(await runJob(t.runnerDeps, jobId)).toMatchObject({ status: "canceled" });
    const [job] = await getJobs(id);
    expect(job.status).toBe("canceled");
    expect((await getProject(id)).status).toBe("SCRIPT_GENERATING"); // 임의로 성공 처리하지 않음
  });

  it("Outbox: 커밋 후 전달이 누락돼도 스윕이 다시 전달해 처리한다", async () => {
    const { t, id } = await queuedScriptJob(); // dispatcher=none → 전달 누락 상황
    const [before] = await getJobs(id);
    expect(before).toMatchObject({ status: "queued", dispatched_at: null });

    const pending: Promise<void>[] = [];
    const inline = new InlineDispatcher(admin(), (jid) => runJob(t.runnerDeps, jid), (task) => void pending.push(task()));
    const count = await drainOutbox(admin(), inline);
    expect(count).toBeGreaterThanOrEqual(1);
    await Promise.all(pending);

    const [after] = await getJobs(id);
    expect(after.status).toBe("succeeded");
    expect(after.dispatched_at).not.toBeNull();
    expect((await getProject(id)).status).toBe("SCRIPT_REVIEW");
  });
});
