import { buildServiceDeps, readJson, route } from "../../../../../../server/http";
import { approveFinal } from "../../../../../../server/project-service";

/** 최종 미리보기 승인 { revision, contentHash } → 컴포지션 고정 + MP4 렌더 작업 enqueue */
export const POST = route<{ id: string }>(
  async ({ req, auth, params }) => approveFinal(buildServiceDeps(), auth.userId, params.id, await readJson(req)),
  202,
);
