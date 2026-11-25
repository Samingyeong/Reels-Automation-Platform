import { buildServiceDeps, readJson, route } from "../../../../../../server/http";
import { approveScript } from "../../../../../../server/project-service";

/** 대본 승인 { revision, contentHash } → 승인 버전 기록 + 장면 생성 작업 enqueue (원자적) */
export const POST = route<{ id: string }>(
  async ({ req, auth, params }) => approveScript(buildServiceDeps(), auth.userId, params.id, await readJson(req)),
  202,
);
