import { buildServiceDeps, readJson, route } from "../../../../../../../server/http";
import { regenerateNarration } from "../../../../../../../server/project-service";

/** 장면 하나의 나레이션·자막 다시 생성 { revision, narration? } */
export const POST = route<{ id: string; sceneId: string }>(
  async ({ req, auth, params }) =>
    regenerateNarration(buildServiceDeps(), auth.userId, params.id, params.sceneId, await readJson(req)),
  202,
);
