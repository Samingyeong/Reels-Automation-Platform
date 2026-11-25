import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { drainOutbox } from "../server/jobs/dispatcher";
import { runJob } from "../server/jobs/runner";
import { TriggerDispatcher } from "../server/jobs/trigger-dispatcher";
import { createWorkerDeps } from "../server/jobs/worker-deps";

/**
 * Trigger.dev 태스크는 얇은 래퍼다. 실행·재시도·상태 전이 로직은 모두 runJob() (DB 가 진실 공급원).
 *  - 태스크 재시도는 0 (trigger.config.ts). 실패 재시도는 jobs.run_after + 스윕이 다시 전달한다.
 *  - 같은 job 이 두 번 전달돼도 claim_job lease 로 한 번만 실행된다.
 */
const JobPayload = z.object({ jobId: z.string().uuid() });

export const pipelineJob = schemaTask({
  id: "pipeline-job",
  schema: JobPayload,
  machine: "small-1x",
  maxDuration: 900,
  run: async ({ jobId }) => {
    const outcome = await runJob(createWorkerDeps(), jobId);
    logger.info("job outcome", { jobId, ...outcome });
    return outcome;
  },
});

/** MP4 렌더 전용 (Chromium + ffmpeg 인코딩) */
export const renderJob = schemaTask({
  id: "render-job",
  schema: JobPayload,
  machine: "large-1x",
  maxDuration: 1800,
  run: async ({ jobId }) => {
    const outcome = await runJob(createWorkerDeps(), jobId);
    logger.info("render outcome", { jobId, ...outcome });
    return outcome;
  },
});

/** Outbox 스윕: 전달 누락·재시도 대기 만료·lease 만료 작업을 다시 전달 (1분 주기) */
export const sweepOutbox = schedules.task({
  id: "sweep-outbox",
  cron: "* * * * *",
  run: async () => {
    const deps = createWorkerDeps();
    const count = await drainOutbox(deps.db, new TriggerDispatcher(deps.db));
    return { dispatched: count };
  },
});
