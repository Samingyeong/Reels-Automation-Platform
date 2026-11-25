# CLAUDE.md

AI 숏폼 제작 → 단계별 사용자 승인 → MP4 자동 렌더 → Instagram Reels 예약 발행 서비스.
사용자는 영상 파일을 직접 다운로드/업로드하지 않는다.

## 스택
Next.js App Router · TypeScript · Tailwind v4 · shadcn/ui · Supabase(DB/Auth/Storage/Realtime) · Remotion(Player/Renderer) · Trigger.dev v4 · Vercel.
Python 서버, FastAPI, n8n, Redis, Inngest 는 도입하지 않는다.

## 먼저 읽을 문서
- `docs/03-state-machine.md` — 상태·승인·초기화 규칙 (가장 중요)
- `docs/01-architecture.md` — 흐름, 멱등성, 보안
- `docs/06-work-plan.md` — 마일스톤, **파일 소유권**, 계약 변경 절차
- `docs/decisions.md` — 확정된 결정과 **재검토 조건** (라이선스, Instagram 인증·발행 정책, provider 선정 기준, 의존성, 보안 모델)
- 나머지: `00-research`(OSS·라이선스), `02-db-schema`, `04-api-spec`, `05-providers`, `07-test-deploy`(검증 기록)

## 명령
```
npm run db:start          # 로컬 Supabase (Docker). 이 클라우드 환경에선 SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io
npm run env:local         # 로컬 Supabase 접속 정보로 .env.local 생성
npm run dev               # Next.js (TRIGGER_SECRET_KEY 없으면 inline: 작업을 응답 후 같은 프로세스에서 실행)
npm run remotion:bundle   # 렌더용 Remotion 사전 번들 (.remotion-bundle). build 에 포함
npm run test:e2e          # Playwright 전체 흐름 (npm run build 후)
npm run trigger:dev       # Trigger.dev 로컬 워커 (로그인·TRIGGER_PROJECT_REF 필요)
npm run remotion          # Remotion Studio
npm test                  # 단위 테스트
npm run test:integration  # 통합 테스트 (로컬 Supabase 필요)
npm run ci                # lint + typecheck + test + build (커밋 전 필수)
npm run db:reset && npx supabase db lint --fail-on warning && npx supabase db advisors --fail-on warn && npm run db:types
```
- npm **11** 사용(`packageManager`). npm 10 의 `npm install` 은 arborist 버그로 실패한다 (DR-006). `legacy-peer-deps` 사용 금지.
- 의존성은 정확한 버전으로 추가 (`npm install -E`). install script 가 필요한 패키지는 `npm install-scripts approve <pkg>`.
- Remotion 패키지는 모두 **같은 정확한 버전**으로 고정한다 (`npx remotion upgrade`).
- 마이그레이션은 `npx supabase migration new <name>` 으로 생성, 커밋된 마이그레이션은 수정하지 않는다.
- 이 클라우드 개발 환경에서는 Node 가 프록시를 직접 쓰지 않아, 실제 렌더(Chromium 다운로드)가 있는 명령 앞에 `NODE_USE_ENV_PROXY=1` 을 붙인다 (DR-013).

## 절대 규칙
1. **승인 없이 다음 단계 금지.** 상태 변경은 반드시 `src/domain/pipeline.ts` 의 `transition()` 을 거쳐 `apply_transition` RPC 한 번으로 반영한다 (`src/server/project-service.ts`, `src/server/jobs/runner.ts`). 직접 `status` 를 UPDATE 하지 않는다.
2. **수정 → 후속 승인 초기화.** 새 수정 기능을 만들면 해당 `EDIT_*` 이벤트의 부수효과(REVOKE_APPROVALS, INVALIDATE_RENDER, CANCEL_SCHEDULED_PUBLICATION)를 실행한다.
3. **임의 성공 표시 금지.** `*_SUCCEEDED` / `PUBLISHED` 는 워커가 실제 결과물(Storage 객체, IG media id)을 저장한 뒤에만. Mock 결과는 UI 에 MOCK 표시. 테스트를 통과시키려고 성공을 흉내내지 않는다.
4. **외부 API 는 provider 인터페이스 뒤에서만** (`src/providers/types.ts`). 라우트·컴포넌트에서 SDK 직접 호출 금지.
5. **API 키는 서버 전용.** `src/providers`, `src/server`, `src/trigger` 를 `"use client"` 모듈에서 import 금지. `NEXT_PUBLIC_` 는 Supabase URL·anon key 만.
6. **장시간 작업은 백그라운드.** Route Handler 는 `jobs`(outbox) 를 트랜잭션 안에서 만들고 커밋 후 디스패치만 한다. 실행은 Trigger.dev 태스크(`src/trigger/jobs.ts`)가 `runJob()` 을 호출 (로컬은 inline). 작업 로직을 태스크 파일에 쓰지 않는다 (DR-011).
7. **멱등성.** 외부 호출 작업은 `jobInputKey()` 로 키를 만들고, Trigger.dev 키는 `idempotencyKeys.create(key, { scope: "global" })`. 발행은 `ig_container_id`/`ig_media_id` 를 단계마다 즉시 저장하고 있으면 재사용.
8. **실제 Instagram 게시·유료 API 실호출은 사용자 승인 후에만.** 기본값 `PROVIDER_MODE=mock`, `PUBLISH_MODE=mock`. CI 에서 live 호출 금지.
9. **공통 계약(★ docs/06) 은 계약 변경 절차 없이 수정하지 않는다.**
10. Render Studio(FSL 라이선스) 코드는 복사하지 않는다. MIT 코드 아이디어 차용 시 출처 주석.
11. **DB 보안.** 새 테이블은 RLS + 명시적 GRANT(authenticated 는 SELECT 만). RPC 는 `SECURITY INVOKER`, `search_path=''`, EXECUTE 는 service_role 만. 사용자 검증은 `getClaims()`.
12. **검증 기록.** 로컬 결과와 GitHub Actions 결과를 `docs/07-test-deploy.md §6` 에 구분해 기록한다.

## 코드 규칙
- 입력 검증은 zod (`src/domain/schemas.ts` 재사용). Remotion 컴포지션 props 도 같은 스키마.
- Player 미리보기와 서버 렌더는 같은 `ReelComposition` + 같은 props(`resolveCompositionPlan`) 를 쓴다.
- UI: shadcn/ui(`src/components/ui`, `npx shadcn@4.23.0 add`) + 스튜디오 컴포넌트(`src/components/studio`). 서버 응답 타입은 `import type` 으로만 공유. Remotion Player 는 `next/dynamic` 으로 지연 로드.
- E2E 셀렉터는 `data-testid` 를 쓴다. 작업 완료 대기는 `stage-panel[data-pending=false]` + `status-pill[data-status]`.
- 새 상태/이벤트는 `pipeline.test.ts` 에 허용·거부 케이스를 함께 추가.
- Supabase 는 자주 바뀐다: 구현 전 공식 문서·changelog 확인 (`supabase` skill).
- 커밋 전 `npm run ci` 통과. 실패를 숨기거나 테스트를 skip 하지 않는다.

## Skills
- 공식: `.claude/skills/`(skills CLI 로 설치, `skills-lock.json` 고정) + Remotion 공식 플러그인(`.claude/settings.json`). 재설치: `bash scripts/install-agent-skills.sh`. 작업 전 관련 skill 을 로드한다.
  - Remotion 작업 → `remotion:remotion-best-practices`, 자막 → `remotion:remotion-captions`, 렌더 → `remotion:remotion-render`, 라이선스 → `remotion:remotion-license`
  - Trigger.dev 태스크 → `trigger-tasks`, 설정 → `trigger-setup`, 진행 표시 → `trigger-realtime`
  - Supabase → `supabase`, `supabase-postgres-best-practices`
  - React/Next UI → `vercel-react-best-practices`, `vercel-composition-patterns` / 배포 → `deploy-to-vercel`
  - LLM provider → `claude-api`(Claude Code 기본 제공), E2E → `webapp-testing`, skill 작성 → `skill-creator`(기본 제공)
- 프로젝트 전용 (`.claude/skills/`): `pipeline-change`, `add-provider`, `add-trigger-task`, `db-migration`
