import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { serverEnv } from "./env";

export type Db = SupabaseClient<Database>;

/**
 * service_role(secret key) 클라이언트. RLS 를 우회하므로 **반드시 소유권을 확인한 뒤** 사용한다.
 * 쓰기는 이 클라이언트로 RPC(apply_transition 등)만 호출한다.
 */
export function createAdminClient(): Db {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 요청 쿠키 기반 사용자 클라이언트 (RLS 적용). Route Handler / Server Component 용. */
export async function createUserClientFromCookies(): Promise<Db> {
  const env = serverEnv();
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 담당한다.
        }
      },
    },
  });
}

/** Authorization: Bearer <jwt> 기반 사용자 클라이언트 (API 클라이언트·테스트용, RLS 적용). */
export function createUserClientFromToken(accessToken: string): Db {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
