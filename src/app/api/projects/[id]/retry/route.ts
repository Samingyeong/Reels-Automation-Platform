import { buildServiceDeps, readJson, route } from "../../../../../server/http";
import { retryFailedStep } from "../../../../../server/project-service";

/** 실패한 단계 재시도 (RETRY) */
export const POST = route<{ id: string }>(
  async ({ req, auth, params }) => retryFailedStep(buildServiceDeps(), auth.userId, params.id, await readJson(req)),
  202,
);
