import "server-only";
import { after, NextResponse } from "next/server";
import { requireUser, type AuthContext } from "./auth";
import { EnvConfigError, serverEnv } from "./env";
import { ServiceError } from "./errors";
import { drainOutbox, InlineDispatcher, NoopDispatcher, type JobDispatcher } from "./jobs/dispatcher";
import { runJob } from "./jobs/runner";
import { TriggerDispatcher } from "./jobs/trigger-dispatcher";
import { createWorkerDeps } from "./jobs/worker-deps";
import type { ServiceDeps } from "./project-service";

let lastInlineSweep = 0;

/** 요청마다 서비스 의존성 구성. 작업 디스패치 방식은 JOB_DISPATCH_MODE 로 선택 (env.ts). */
export function buildServiceDeps(): ServiceDeps {
  const worker = createWorkerDeps();
  const admin = worker.db;
  const mode = serverEnv().JOB_DISPATCH_MODE;
  let dispatcher: JobDispatcher;
  if (mode === "trigger") {
    dispatcher = new TriggerDispatcher(admin);
  } else if (mode === "inline") {
    // 응답을 보낸 뒤 같은 런타임에서 실행 (next/server after). Trigger.dev 없는 로컬 개발·E2E 용.
    const inline = new InlineDispatcher(admin, (id) => runJob(worker, id), (task) => after(task));
    dispatcher = inline;
    // 서버 재시작 등으로 남은 작업 회수 (Trigger.dev 모드에서는 sweep-outbox 스케줄 태스크가 담당)
    if (Date.now() - lastInlineSweep > 30_000) {
      lastInlineSweep = Date.now();
      after(() => drainOutbox(admin, inline).then(() => undefined).catch(() => undefined));
    }
  } else {
    dispatcher = new NoopDispatcher();
  }
  return { admin, dispatcher, providers: worker.providers };
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
  if (err instanceof EnvConfigError) {
    // 배포 설정 누락(예: Trigger.dev 연결 없음)은 조용히 대체하지 않고 명확히 실패시킨다. 비밀 값은 메시지에 없다.
    console.error("[config]", err.message);
    return NextResponse.json({ error: { code: "SERVICE_MISCONFIGURED", message: err.message } }, { status: 503 });
  }
  if (err instanceof ServiceError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "서버 오류가 발생했습니다." } }, { status: 500 });
}
