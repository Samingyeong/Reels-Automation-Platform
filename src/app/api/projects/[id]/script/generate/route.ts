import { buildServiceDeps, readJson, route } from "../../../../../../server/http";
import { requestScriptGeneration } from "../../../../../../server/project-service";

/** 대본 생성(또는 다시 생성) 요청 → 202, 결과는 GET /api/projects/:id 또는 Realtime */
export const POST = route<{ id: string }>(
  async ({ req, auth, params }) => requestScriptGeneration(buildServiceDeps(), auth.userId, params.id, await readJson(req)),
  202,
);
