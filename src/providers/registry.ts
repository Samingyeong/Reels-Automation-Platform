/**
 * 환경 변수로 provider 구현을 선택한다. 서버/워커 전용.
 *
 * PROVIDER_MODE=mock (기본값) | live
 * PUBLISH_MODE=mock (기본값) | live   ← 실제 Instagram 게시는 별도 스위치. 사용자 승인 후에만 live.
 *
 * live 구현은 M3 이후 추가된다 (docs/06-work-plan.md). 미구현 provider 를 live 로 요청하면
 * 조용히 mock 으로 대체하지 않고 즉시 에러를 던진다 → 임의 성공 표시 방지.
 */
import { createMockProviders } from "./mock";
import type { Providers } from "./types";

export type ProviderMode = "mock" | "live";

type Env = Record<string, string | undefined>;

export function readMode(value: string | undefined, key: string): ProviderMode {
  if (value === undefined || value === "" || value === "mock") return "mock";
  if (value === "live") return "live";
  throw new Error(`${key} 값이 올바르지 않습니다: ${value} (mock | live)`);
}

export function getProviders(env: Env = process.env): Providers {
  const mode = readMode(env.PROVIDER_MODE, "PROVIDER_MODE");
  const publishMode = readMode(env.PUBLISH_MODE, "PUBLISH_MODE");
  const providers = createMockProviders();

  if (mode === "live") {
    throw new Error("PROVIDER_MODE=live 는 아직 구현되지 않았습니다 (M3).");
  }
  if (publishMode === "live") {
    throw new Error("PUBLISH_MODE=live 는 아직 구현되지 않았습니다 (M4).");
  }
  return providers;
}
