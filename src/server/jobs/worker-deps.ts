import "server-only";
import { getProviders } from "../../providers/registry";
import { createRemotionRenderer } from "../render/remotion-renderer";
import { createAdminClient } from "../supabase";
import type { RunnerDeps } from "./runner";

/** 워커(Trigger.dev 태스크·inline 실행) 공용 의존성 */
export function createWorkerDeps(): RunnerDeps {
  return { db: createAdminClient(), providers: getProviders(), renderer: createRemotionRenderer() };
}
