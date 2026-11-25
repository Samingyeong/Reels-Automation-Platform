import "server-only";
import type { Db } from "../supabase";
import type { RunOutcome } from "./runner";

/**
 * Outbox 디스패처: DB 트랜잭션이 커밋된 **이후** jobs 행을 실행기에 전달한다.
 * 전달 실패는 무시해도 안전하다 — 행이 queued 로 남아 drainOutbox() 스윕이 다시 전달한다.
 *
 *  - TriggerDispatcher: Trigger.dev 태스크로 전달 (기본, 운영) — src/server/jobs/trigger-dispatcher.ts
 *  - InlineDispatcher : 같은 프로세스에서 runJob 실행 (Trigger.dev 없이 로컬 개발·E2E)
 *  - NoopDispatcher   : outbox 에 기록만 (테스트)
 */
export interface JobDispatcher {
  readonly name: string;
  dispatch(jobIds: string[]): Promise<void>;
}

export class NoopDispatcher implements JobDispatcher {
  readonly name = "none";
  async dispatch(): Promise<void> {}
}

export type Scheduler = (task: () => Promise<void>) => void;

export class InlineDispatcher implements JobDispatcher {
  readonly name = "inline";
  constructor(
    private readonly db: Db,
    private readonly run: (jobId: string) => Promise<RunOutcome | unknown>,
    /** Route Handler 에서는 next/server 의 after(), 테스트에서는 즉시 실행 후 대기 */
    private readonly schedule: Scheduler,
  ) {}

  async dispatch(jobIds: string[]): Promise<void> {
    for (const id of jobIds) {
      await this.db.rpc("mark_job_dispatched", { p_job_id: id, p_run_id: null as unknown as string });
      this.schedule(async () => {
        try {
          const outcome = (await this.run(id)) as RunOutcome | undefined;
          // 재시도 대기: 같은 프로세스에서 지연 후 다시 전달 (프로세스가 죽으면 스윕이 회수)
          if (outcome?.status === "retry_scheduled") {
            setTimeout(() => void this.dispatch([id]), outcome.delaySeconds * 1000 + 50).unref?.();
          }
        } catch (err) {
          console.error(`[jobs] inline run failed job=${id}`, err);
        }
      });
    }
  }
}

/** 스윕: 전달되지 않았거나 lease 가 만료된 작업을 다시 전달한다. (Trigger.dev 스케줄 태스크 / inline 은 요청 시) */
export async function drainOutbox(db: Db, dispatcher: JobDispatcher, limit = 50): Promise<number> {
  const { data, error } = await db.rpc("list_dispatchable_jobs", { p_limit: limit });
  if (error) throw error;
  const ids = (data ?? []).map((j) => j.id);
  await dispatcher.dispatch(ids);
  return ids.length;
}

/**
 * 지정한 종류의 작업은 전달하지 않고 queued 로 남긴다 (cloud 임시 실행 모드에서 render 보류).
 * 성공을 흉내내지 않는다: 작업은 그대로 대기하다가 실제 작업 서버가 연결되면 스윕이 실행한다.
 */
export class HoldKindsDispatcher implements JobDispatcher {
  readonly name: string;
  constructor(
    private readonly db: Db,
    private readonly inner: JobDispatcher,
    private readonly heldKinds: readonly string[],
  ) {
    this.name = `${inner.name}+hold(${heldKinds.join(",")})`;
  }

  async dispatch(jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;
    const { data, error } = await this.db.from("jobs").select("id, kind").in("id", jobIds);
    if (error) throw error;
    const held = new Set((data ?? []).filter((j) => this.heldKinds.includes(j.kind)).map((j) => j.id));
    await this.inner.dispatch(jobIds.filter((id) => !held.has(id)));
  }
}
