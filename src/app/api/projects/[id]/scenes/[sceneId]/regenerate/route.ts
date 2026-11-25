import { buildServiceDeps, readJson, route } from "../../../../../../../server/http";
import { regenerateScene } from "../../../../../../../server/project-service";

/** 장면 하나만 (프롬프트·길이 수정 후) 다시 생성 { revision, visualPrompt?, durationSec? } */
export const POST = route<{ id: string; sceneId: string }>(
  async ({ req, auth, params }) =>
    regenerateScene(buildServiceDeps(), auth.userId, params.id, params.sceneId, await readJson(req)),
  202,
);
