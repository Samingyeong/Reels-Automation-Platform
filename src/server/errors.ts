/** 서비스 계층 오류 → HTTP 응답 매핑 (docs/04-api-spec.md 공통 규약). */
export type ServiceErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVALID_TRANSITION"
  | "REVISION_CONFLICT"
  | "CONTENT_CHANGED"
  | "PRECONDITION_FAILED"
  | "INTERNAL";

const STATUS: Record<ServiceErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_TRANSITION: 409,
  REVISION_CONFLICT: 409,
  CONTENT_CHANGED: 409,
  PRECONDITION_FAILED: 409,
  INTERNAL: 500,
};

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details?: unknown;
  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
  get status(): number {
    return STATUS[this.code];
  }
}

/** PostgREST/RPC 오류를 서비스 오류로 변환. apply_transition 이 raise 하는 메시지를 해석한다. */
export function fromDbError(error: { message: string; code?: string; details?: string | null }): ServiceError {
  if (error.message.includes("REVISION_CONFLICT")) {
    return new ServiceError("REVISION_CONFLICT", "다른 변경이 먼저 반영되었습니다. 새로고침 후 다시 시도하세요.", error.details);
  }
  if (error.message.includes("PROJECT_NOT_FOUND") || error.message.includes("SCENE_NOT_FOUND")) {
    return new ServiceError("NOT_FOUND", "리소스를 찾을 수 없습니다.");
  }
  if (error.message.includes("JOB_NOT_RUNNING")) {
    return new ServiceError("PRECONDITION_FAILED", "작업이 실행 중 상태가 아닙니다.", error.details);
  }
  return new ServiceError("INTERNAL", "데이터베이스 오류가 발생했습니다.", { code: error.code });
}
