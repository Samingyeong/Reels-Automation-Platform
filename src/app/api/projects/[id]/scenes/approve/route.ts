import { buildServiceDeps, readJson, route } from "../../../../../../server/http";
import { approveScenes } from "../../../../../../server/project-service";

/** 장면 영상 승인 { revision, contentHash } → 나레이션·자막 작업 enqueue */
export const POST = route<{ id: string }>(
  async ({ req, auth, params }) => approveScenes(buildServiceDeps(), auth.userId, params.id, await readJson(req)),
  202,
);
