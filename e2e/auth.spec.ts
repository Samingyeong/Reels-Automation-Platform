import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * 가입 비밀번호 확인 + 비밀번호 찾기/재설정.
 * 로컬 스택은 메일 서버(mailpit)를 띄우지 않으므로 재설정 링크는 관리자 API(generateLink)로 만든다.
 * 메일 본문 링크와 같은 /auth/confirm 경로(token_hash 방식)를 통과한다.
 */
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("E2E 에는 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY 가 필요합니다 (.env.local).");
  return createClient(url, key, { auth: { persistSession: false } });
}

test("가입: 비밀번호 확인이 다르면 막고, 같으면 가입된다", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("계정이 없나요? 가입하기").click();
  await page.locator("#email").fill(`auth-${Date.now()}@example.test`);
  await page.locator("#password").fill("password123");
  await page.locator("#password-confirm").fill("password124");
  await expect(page.getByTestId("password-mismatch")).toBeVisible();
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(page).toHaveURL(/\/login$/); // 브라우저 검증으로 제출되지 않음

  await page.locator("#password-confirm").fill("password123");
  await expect(page.getByTestId("password-mismatch")).toBeHidden();
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("비밀번호 찾기 → 재설정 링크 → 새 비밀번호로 로그인", async ({ page }) => {
  const email = `reset-${Date.now()}@example.test`;
  const db = admin();
  const created = await db.auth.admin.createUser({ email, password: "oldpassword1", email_confirm: true });
  expect(created.error).toBeNull();

  // 1) 재설정 요청 화면: 가입 여부와 무관한 같은 안내
  await page.goto("/login");
  await page.getByText("비밀번호를 잊으셨나요?").click();
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "재설정 메일 보내기" }).click();
  await expect(page.getByTestId("auth-notice")).toContainText("재설정 링크");

  // 2) 잘못된 링크는 로그인 화면으로 안내
  await page.goto("/auth/confirm?token_hash=invalid&type=recovery&next=/reset-password");
  await expect(page).toHaveURL(/\/login\?error=reset_link_invalid/);
  await expect(page.getByTestId("auth-error")).toContainText("재설정 링크");

  // 3) 유효한 링크 → 새 비밀번호 화면 (확인 불일치 검사 포함)
  const link = await db.auth.admin.generateLink({ type: "recovery", email });
  expect(link.error).toBeNull();
  await page.goto(`/auth/confirm?token_hash=${link.data.properties!.hashed_token}&type=recovery&next=/reset-password`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.locator("#password").fill("newpassword1");
  await page.locator("#password-confirm").fill("newpassword2");
  await expect(page.getByTestId("password-mismatch")).toBeVisible();
  await page.locator("#password-confirm").fill("newpassword1");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page).toHaveURL(/\/$/);

  // 4) 로그아웃 상태에서 새 비밀번호로만 로그인 가능
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("oldpassword1");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByTestId("auth-error")).toContainText("이메일 또는 비밀번호");
  await page.locator("#password").fill("newpassword1");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("재설정 화면은 링크 없이 접근할 수 없다", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/login\?error=reset_link_invalid/);
});

test("재설정 메일 링크(Supabase verify → /auth/callback)는 요청하지 않은 브라우저에서도 동작", async ({ page, baseURL }) => {
  const email = `xdev-${Date.now()}@example.test`;
  const db = admin();
  expect((await db.auth.admin.createUser({ email, password: "oldpassword1", email_confirm: true })).error).toBeNull();
  // 메일 본문과 같은 링크 (PKCE code_challenge 없이 발급 → 새 브라우저 컨텍스트에서 열기)
  const link = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${baseURL}/auth/callback?next=/reset-password` },
  });
  expect(link.error).toBeNull();
  await page.goto(link.data.properties!.action_link);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.locator("#password").fill("crossdevice1");
  await page.locator("#password-confirm").fill("crossdevice1");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("콜백에 토큰이 없으면 로그인 화면으로 안내", async ({ page }) => {
  await page.goto("/auth/callback?next=/reset-password#error=access_denied&error_code=otp_expired");
  await expect(page).toHaveURL(/\/login\?error=reset_link_invalid/);
});
