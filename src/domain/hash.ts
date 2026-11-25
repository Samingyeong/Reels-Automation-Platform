/**
 * 콘텐츠 해시: (1) 승인 시점의 콘텐츠 고정 (2) 동일 입력의 외부 API 재호출 방지에 사용.
 * 서버/워커 전용 (node:crypto).
 */
import { createHash } from "node:crypto";

/** 키 순서와 무관하게 동일한 문자열을 만든다. undefined 필드는 제외한다. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/**
 * 외부 API 작업의 멱등 키. 같은 provider·모델·입력이면 같은 키 → 기존 결과 재사용.
 * 형식: `${kind}:${provider}:${sha256}`
 */
export function jobInputKey(kind: string, provider: string, input: unknown): string {
  return `${kind}:${provider}:${contentHash(input)}`;
}
