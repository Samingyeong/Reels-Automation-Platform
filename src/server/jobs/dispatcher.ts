import "server-only";
import type { Db } from "../supabase";
import type { JobKind } from "../../domain/pipeline";

/**
 * Outbox 디스패처: DB 트랜잭션이 커밋된 **이후** jobs 행을 실행기에 전달한다.
 * 전달 실패는 무시해도 안전하다 — 행이 queued 로 남아 drainOutbox() 스윕이 다시 전달한다.
 *
 *  - InlineDispatcher : 같은 프로세스에서 runJob 실행 (개발·테스트, M1)
 *  - TriggerDispatcher: tasks.trigger(..., { idempotencyKey: jobs.idempotency_key }) (M2)
 */
export interface JobDispatcher {
  readonly name: string;
  dispatch(jobIds: string[]): Promise<void>;
}

/** M1 에서 실행기를 가진 작업 종류. 나머지는 M2(Trigger.dev) 전까지 queued 로 남는다. */
export const INLINE_HANDLED_KINDS: ReadonlySet<JobKind> = new Set<JobKind>(["script"]);

export class NoopDispatcher implements JobDispatcher {
  readonly name = "none";
  async dispatch(): Promise<void> {}
}

export type Scheduler = (task: () => Promise<void>) => void;

export class InlineDispatcher implements JobDispatcher {
  readonly name = "inline";
  constructor(
    private readonly db: Db,
    private readonly run: (jobId: string) => Promise<unknown>,
    /** Route Handler 에서는 next/server 의 after(), 테스트에서는 즉시 실행 후 대기 */
    private readonly schedule: Scheduler,
  ) {}

  async dispatch(jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;
    const { data: jobs } = await this.db.from("jobs").select("id, kind").in("id", jobIds);
    for (const job of jobs ?? []) {
      if (!INLINE_HANDLED_KINDS.has(job.kind)) continue;
      await this.db.rpc("mark_job_dispatched", { p_job_id: job.id, p_run_id: null as unknown as string });
      this.schedule(async () => {
        try {
          await this.run(job.id);
        } catch (err) {
          console.error(`[jobs] inline run failed job=${job.id}`, err);
        }
      });
    }
  }
}

/** 스윕: 전달되지 않았거나 lease 가 만료된 작업을 다시 전달한다. (M2 에서 Trigger.dev cron 이 호출) */
export async function drainOutbox(db: Db, dispatcher: JobDispatcher, limit = 50): Promise<number> {
  const { data, error } = await db.rpc("list_dispatchable_jobs", { p_limit: limit });
  if (error) throw error;
  const ids = (data ?? []).map((j) => j.id);
  await dispatcher.dispatch(ids);
  return ids.length;
}
