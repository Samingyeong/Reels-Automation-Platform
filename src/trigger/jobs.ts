import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { drainOutbox } from "../server/jobs/dispatcher";
import { runJob } from "../server/jobs/runner";
import { TriggerDispatcher } from "../server/jobs/trigger-dispatcher";
import { createWorkerDeps } from "../server/jobs/worker-deps";

/**
 * Trigger.dev 태스크는 얇은 래퍼다. 실행·재시도·상태 전이 로직은 모두 runJob() (DB 가 진실 공급원).
 *  - 태스크 자체 재시도는 0 (trigger.config.ts). 일시 오류는 runJob 이 jobs.run_after 를 정하고,
 *    여기서 같은 작업을 지연 실행(delay)으로 다시 전달한다. 스윕은 전달 누락에 대비한 안전망.
 *  - 같은 job 이 두 번 전달돼도 claim_job lease 로 한 번만 실행된다.
 */
const JobPayload = z.object({ jobId: z.string().uuid() });

async function execute(jobId: string) {
  const deps = createWorkerDeps();
  const outcome = await runJob(deps, jobId);
  logger.info("job outcome", { jobId, ...outcome });
  if (outcome.status === "retry_scheduled") {
    await new TriggerDispatcher(deps.db).dispatch([jobId], { delaySeconds: outcome.delaySeconds });
  }
  return outcome;
}

export const pipelineJob = schemaTask({
  id: "pipeline-job",
  schema: JobPayload,
  machine: "small-1x",
  maxDuration: 900,
  run: async ({ jobId }) => execute(jobId),
});

/** MP4 렌더 전용 (Chromium + ffmpeg 인코딩) */
export const renderJob = schemaTask({
  id: "render-job",
  schema: JobPayload,
  machine: "large-1x",
  maxDuration: 1800,
  run: async ({ jobId }) => execute(jobId),
});

/**
 * Outbox 스윕: 전달 누락·lease 만료 작업을 다시 전달하는 안전망.
 * 1시간 주기·micro 머신 → 월 약 720회 ≈ $0.05.
 * Trigger.dev Free 조직은 선언형 스케줄에 60분 기본 실행 창(window)이 적용된다
 * (webapp `createBackgroundWorker.server.ts` schedule_default_window, `freeSchedulePolicy.server.ts`).
 * 정상 경로는 요청 즉시 트리거 + 재시도 delay 트리거이므로 스윕은 드문 회수용으로 충분하다.
 */
export const sweepOutbox = schedules.task({
  id: "sweep-outbox",
  cron: "0 * * * *",
  machine: "micro",
  run: async () => {
    const deps = createWorkerDeps();
    const count = await drainOutbox(deps.db, new TriggerDispatcher(deps.db));
    return { dispatched: count };
  },
});
