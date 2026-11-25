import { describe, expect, it } from "vitest";
import { EnvConfigError, parseServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
};

describe("서버 환경 설정 (local / cloud 분리)", () => {
  it("local 기본: Trigger 키가 없으면 inline, 있으면 trigger", () => {
    expect(parseServerEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toMatchObject({
      APP_ENV: "local",
      JOB_DISPATCH_MODE: "inline",
    });
    expect(parseServerEnv({ ...base, TRIGGER_SECRET_KEY: "tr_dev_x" }).JOB_DISPATCH_MODE).toBe("trigger");
  });

  it("cloud 에서 Trigger.dev 키가 없으면 로컬 실행으로 바뀌지 않고 오류", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "cloud" })).toThrow(EnvConfigError);
    expect(() => parseServerEnv({ ...base, VERCEL: "1" })).toThrow(/Trigger\.dev 연결이 없습니다/);
  });

  it("cloud 에서 inline/none 강제 설정은 거부", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "cloud", TRIGGER_SECRET_KEY: "tr_prod_x", JOB_DISPATCH_MODE: "inline" })).toThrow(
      EnvConfigError,
    );
  });

  it("cloud 에서 로컬 Supabase 주소는 거부", () => {
    expect(() =>
      parseServerEnv({ ...base, APP_ENV: "cloud", TRIGGER_SECRET_KEY: "tr_prod_x", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }),
    ).toThrow(EnvConfigError);
  });

  it("cloud 정상 설정 → trigger", () => {
    expect(parseServerEnv({ ...base, VERCEL: "1", TRIGGER_SECRET_KEY: "tr_prod_x" })).toMatchObject({
      APP_ENV: "cloud",
      JOB_DISPATCH_MODE: "trigger",
    });
  });

  it("빈 값은 미설정으로 취급", () => {
    expect(parseServerEnv({ ...base, JOB_DISPATCH_MODE: "", TRIGGER_SECRET_KEY: "" }).JOB_DISPATCH_MODE).toBe("inline");
  });
});
