import { route } from "../../../../server/http";
import { getProjectDetail } from "../../../../server/project-service";

export const GET = route<{ id: string }>(async ({ auth, params }) => getProjectDetail(auth.db, params.id));
