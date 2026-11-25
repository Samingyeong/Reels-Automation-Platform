import { buildServiceDeps, readJson, route } from "../../../server/http";
import { createProject, listProjects } from "../../../server/project-service";

export const GET = route(async ({ auth }) => listProjects(auth.db));

export const POST = route(async ({ req, auth }) => createProject(buildServiceDeps(), auth.userId, await readJson(req)), 201);
