// 타입 전용 import (런타임 코드는 번들되지 않음): 서버 응답 형태를 클라이언트와 공유
import type { getProjectDetail, listProjects } from "@/server/project-service";

export type ProjectDetail = Awaited<ReturnType<typeof getProjectDetail>>;
export type SceneDetail = ProjectDetail["scenes"][number];
export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];
