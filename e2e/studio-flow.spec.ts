import { expect, test, type Page } from "@playwright/test";

const status = (page: Page) => page.getByTestId("status-pill").first();

async function waitStatus(page: Page, value: string, timeout = 60_000) {
  await expect(page.getByTestId("stage-panel")).toHaveAttribute("data-pending", "false", { timeout });
  await expect(status(page)).toHaveAttribute("data-status", value, { timeout });
}

test("대본 → 장면(개별 수정·재생성) → 나레이션(개별 재녹음) → 최종 MP4 렌더 → 렌더 후 장면 재생성", async ({ page, request }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // 1) 가입 → 홈
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByText("계정이 없나요? 가입하기").click();
  await page.locator("#email").fill(`e2e-${Date.now()}@example.test`);
  await page.locator("#password").fill("password123");
  await page.locator("#password-confirm").fill("password123");
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(page).toHaveURL(/\/$/);

  // 2) 주제 입력 → 대본 생성
  await page.getByTestId("topic-input").fill("아침 커피, 언제 마시는 게 좋을까?");
  await page.getByRole("radio", { name: "15초" }).click();
  await page.getByTestId("create-project").click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  await waitStatus(page, "SCRIPT_REVIEW");
  await expect(page.getByTestId("script-scene")).toHaveCount(3);
  await expect(page.getByText("MOCK").first()).toBeVisible();

  // 3) 대본 수정(장면 2 나레이션) → 승인 (저장 후 최신 해시로 승인)
  const narration2 = page.getByTestId("scene-narration").nth(1);
  await narration2.fill("커피는 기상 후 한두 시간 뒤에 마시세요.");
  await page.getByTestId("approve-script").click();
  await waitStatus(page, "SCENES_REVIEW");
  await expect(page.locator('[data-testid=scene-card][data-scene-status=ready]')).toHaveCount(3);

  // 4) 장면 2만 프롬프트 수정 후 재생성 → 나머지 장면은 그대로
  const cards = page.getByTestId("scene-card");
  await cards.nth(1).click();
  await expect(page).toHaveURL(/scene=/);
  const inspector = page.getByTestId("scene-inspector");
  await expect(inspector).toContainText("기상 후 한두 시간 뒤");
  await page.getByTestId("inspector-prompt").fill("sunrise kitchen, steaming coffee cup, vertical 9:16");
  await page.getByTestId("regenerate-scene").click();
  await waitStatus(page, "SCENES_REVIEW");
  await expect(page.getByTestId("inspector-prompt")).toHaveValue("sunrise kitchen, steaming coffee cup, vertical 9:16");
  await expect(page.locator('[data-testid=scene-card][data-scene-status=ready]')).toHaveCount(3);

  // 5) 새로고침해도 진행 상태와 선택한 장면이 유지된다
  await page.reload();
  await waitStatus(page, "SCENES_REVIEW");
  await expect(page.getByTestId("scene-card").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("preview-frame")).toHaveAttribute("data-kind", "composition");

  // 6) 장면 승인 → 나레이션·자막 → 최종 미리보기
  await page.getByTestId("approve-scenes").click();
  await waitStatus(page, "FINAL_REVIEW");
  await expect(page.locator('[data-testid=voice-row][data-narration-status=ready]')).toHaveCount(3);
  await expect(page.locator("[data-testid=voice-row] audio")).toHaveCount(3);
  await expect(page.getByTestId("preview-frame")).toHaveAttribute("data-kind", "composition");

  // 7) 장면 3 나레이션 문장만 수정해 다시 녹음
  await page.getByTestId("voice-text").nth(2).fill("오늘부터 커피 타이밍을 바꿔 보세요.");
  await page.getByTestId("regenerate-narration").nth(2).click();
  await waitStatus(page, "FINAL_REVIEW");
  await expect(page.getByTestId("voice-text").nth(2)).toHaveValue("오늘부터 커피 타이밍을 바꿔 보세요.");

  // 8) 최종 승인 → 렌더 중 새로고침 → 렌더 완료 (실제 Remotion 렌더, Storage 저장)
  await page.getByTestId("approve-final").click();
  await waitStatus(page, "RENDERING", 15_000).catch(() => undefined); // 매우 빠르면 바로 RENDERED
  await page.reload();
  await waitStatus(page, "RENDERED", 4 * 60_000);
  await expect(page.getByTestId("render-done")).toBeVisible();
  const video = page.getByTestId("final-video");
  await expect(video).toBeVisible();
  const src = await video.getAttribute("src");
  expect(src).toMatch(/^http/);
  const res = await request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("video/mp4");
  const body = await res.body();
  expect(body.subarray(4, 8).toString("latin1")).toBe("ftyp");
  expect(body.byteLength).toBeGreaterThan(10_000);
  // 다운로드 UI 없음
  await expect(page.locator("a[download]")).toHaveCount(0);

  // 9) 렌더 후 지난 단계로 돌아가 장면 1만 다시 생성 → 장면 검수로 복귀(이후 승인·렌더 초기화)
  await page.getByTestId("stage-scenes").click();
  await page.getByTestId("scene-card").first().click();
  await expect(page.getByTestId("scene-inspector")).toContainText("장면·최종 승인과 렌더 결과가 초기화");
  await page.getByTestId("regenerate-scene").click();
  await waitStatus(page, "SCENES_REVIEW");
  await expect(page.getByTestId("stage-render")).toHaveAttribute("data-state", "locked");

  expect(pageErrors).toEqual([]);
});

test("로그인하지 않으면 스튜디오에 접근할 수 없다", async ({ page }) => {
  await page.goto("/projects/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login$/);
});
