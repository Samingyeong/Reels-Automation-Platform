import { buildServiceDeps, readJson, route } from "../../../../../server/http";
import { editScript } from "../../../../../server/project-service";

/** 대본 수정 → 대본 검수로 복귀, 후속 승인·렌더·예약 무효화 (EDIT_SCRIPT) */
export const PUT = route<{ id: string }>(async ({ req, auth, params }) =>
  editScript(buildServiceDeps(), auth.userId, params.id, await readJson(req)),
);
