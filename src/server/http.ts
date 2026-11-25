import "server-only";
import { after, NextResponse } from "next/server";
import { getProviders } from "../providers/registry";
import { requireUser, type AuthContext } from "./auth";
import { serverEnv } from "./env";
import { ServiceError } from "./errors";
import { InlineDispatcher, NoopDispatcher, type JobDispatcher } from "./jobs/dispatcher";
import { runJob } from "./jobs/runner";
import type { ServiceDeps } from "./project-service";
import { createAdminClient } from "./supabase";

/** 요청마다 서비스 의존성 구성. 작업 디스패치 방식은 JOB_DISPATCH_MODE 로 선택. */
export function buildServiceDeps(): ServiceDeps {
  const admin = createAdminClient();
  const providers = getProviders();
  const mode = serverEnv().JOB_DISPATCH_MODE;
  let dispatcher: JobDispatcher;
  if (mode === "inline") {
    // 응답을 보낸 뒤 같은 런타임에서 실행 (next/server after). 개발·개인용 MVP 용.
    dispatcher = new InlineDispatcher(admin, (id) => runJob({ db: admin, providers }, id), (task) => after(task));
  } else if (mode === "none") {
    dispatcher = new NoopDispatcher();
  } else {
    throw new Error("JOB_DISPATCH_MODE=trigger 는 M2 에서 구현됩니다.");
  }
  return { admin, dispatcher, providers };
}

type Handler<P> = (ctx: { req: Request; auth: AuthContext; params: P }) => Promise<unknown>;

/** 인증 + 오류 매핑 공통 래퍼 */
export function route<P = Record<string, string>>(handler: Handler<P>, okStatus = 200) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const auth = await requireUser(req);
      const params = context?.params ? await context.params : ({} as P);
      const body = await handler({ req, auth, params });
      return NextResponse.json(body, { status: okStatus });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "JSON 본문이 필요합니다.");
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof ServiceError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "서버 오류가 발생했습니다." } }, { status: 500 });
}
