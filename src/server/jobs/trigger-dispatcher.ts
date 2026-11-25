import "server-only";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { pipelineJob, renderJob } from "../../trigger/jobs";
import type { Db } from "../supabase";
import type { JobDispatcher } from "./dispatcher";

/**
 * jobs(outbox) → Trigger.dev. 태스크 인스턴스가 아니라 타입만 import 한다 (trigger-setup skill).
 * 멱등 키: job id + 시도 번호 + 전달 횟수 → 같은 전달의 중복 trigger 는 Trigger.dev 가 무시하고,
 * 재시도(새 attempt)나 스윕 재전달은 새 run 을 만든다. 실제 중복 실행 차단은 claim_job lease 가 담당.
 */
export class TriggerDispatcher implements JobDispatcher {
  readonly name = "trigger";
  constructor(private readonly db: Db) {}

  async dispatch(jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;
    const { data: jobs, error } = await this.db
      .from("jobs")
      .select("id, kind, attempt, dispatch_attempts")
      .in("id", jobIds);
    if (error) throw error;
    for (const job of jobs ?? []) {
      const idempotencyKey = await idempotencyKeys.create(`job:${job.id}:a${job.attempt}:d${job.dispatch_attempts}`, {
        scope: "global",
      });
      const handle =
        job.kind === "render"
          ? await tasks.trigger<typeof renderJob>("render-job", { jobId: job.id }, { idempotencyKey, tags: [`job:${job.id}`] })
          : await tasks.trigger<typeof pipelineJob>("pipeline-job", { jobId: job.id }, { idempotencyKey, tags: [`job:${job.id}`, job.kind] });
      await this.db.rpc("mark_job_dispatched", { p_job_id: job.id, p_run_id: handle.id });
    }
  }
}
