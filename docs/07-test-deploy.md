# 07. 테스트 · 배포 전략

## 1. 테스트 피라미드

| 레벨 | 도구 | 대상 | CI |
| --- | --- | --- | --- |
| 단위 | Vitest | `src/domain`(상태 머신 전수), 해시, mock provider, 스키마 | ✅ 매 PR |
| Provider 계약 | Vitest | 모든 provider 가 같은 계약 테스트 통과. live 는 녹화된 응답(fixture)으로 | ✅ (live 실호출 제외) |
| 서비스 통합 | Vitest + 로컬 Supabase(`npm run db:start`) | `project-service`, RPC, 작업 러너, RLS, Route Handler | ✅ `npm run test:integration` (CI: db-integration 잡) |
| 태스크 | Vitest + Trigger.dev 로컬 dev / 태스크 함수 직접 호출 | 재시도·멱등성(같은 키 두 번 → 외부 호출 1회) | ✅ M2 부터 |
| 렌더 | 실제 `renderMedia` (`tests/integration/remotion-render.test.ts`) | MP4 박스 순서(faststart)·H.264·AAC | ✅ |
| E2E | Playwright (`e2e/`, `npm run test:e2e`) | Mock 전체 흐름 + 실제 Remotion 렌더 | ✅ CI db-integration 잡 |
| 실호출 | 수동 | live provider, Instagram 게시 | ❌ CI 금지, **사용자 승인 후 수동** |

필수 테스트 시나리오
- 승인 없이 다음 단계 불가 / 수정 시 승인 초기화 / 특정 장면만 재생성
- 같은 입력 재생성 시 외부 API 호출 0회
- `publish-reel` 을 두 번 트리거해도 게시 1회, 컨테이너 생성 후 크래시 → 재실행 시 컨테이너 재사용
- 워커 실패 → `*_FAILED` 표시, 성공 상태로 가지 않음
- 다른 사용자의 프로젝트 조회/조작 불가 (RLS + API 404)

## 2. CI (GitHub Actions)

`.github/workflows/ci.yml` — `main`, `claude/**` 푸시와 PR 에서 실행. 비밀값 없이 통과해야 한다 (Mock 기본, 로컬 Supabase 기본 키).

| 잡 | 단계 |
| --- | --- |
| `verify` | npm 11 설치 → `npm ci` → lint → typecheck → unit test → build |
| `db-integration` | `npm ci` → `npm run db:start`(Docker 로 로컬 Supabase, 마이그레이션 적용) → `supabase db lint --fail-on warning` → `supabase db advisors --fail-on warn` → 생성 타입 최신성 diff → `npm run test:integration` → stop |

## 3. 환경

| 환경 | Web | 워커 | DB | Provider |
| --- | --- | --- | --- | --- |
| local | `next dev` (`JOB_DISPATCH_MODE=inline`) | 같은 프로세스(inline) → M2: `npx trigger.dev dev` | `npm run db:start` | mock |
| preview | Vercel Preview | Trigger.dev `staging` | Supabase 스테이징 프로젝트(또는 branching) | mock (live 는 수동 토글) |
| production | Vercel Production | Trigger.dev `prod` | Supabase 프로덕션 | live, `PUBLISH_MODE=live` 는 M4-4 승인 후 |

## 4. 배포 순서

1. DB: `supabase db push` (마이그레이션 먼저, 하위 호환 유지)
2. 워커: `npx trigger.dev deploy --env <env>` (CLI·SDK·build 버전 동일)
3. Web: Vercel Git 연동 자동 배포
4. 스모크: 헬스 체크 + Mock 프로젝트 1건 흐름

롤백: Vercel 이전 배포 promote, Trigger.dev 이전 버전 promote. 마이그레이션은 forward-only (되돌림은 새 마이그레이션).

## 5. 환경 변수

`.env.example` 참조. `NEXT_PUBLIC_` 접두사는 Supabase URL·publishable key 만. 나머지는 Vercel/Trigger.dev 환경변수(서버 전용)로 관리하며 Trigger.dev 는 `syncEnvVars` 대신 대시보드에서 명시적으로 관리한다.

## 6. 검증 기록

로컬(이 개발 환경)과 GitHub Actions 결과를 **구분**해 기록한다. 실행하지 않은 항목은 "미실행"으로 적는다.

### M1 — 2026-11-25

| 항목 | 로컬 (클라우드 개발 컨테이너, Node 22, npm 11.21.3, Docker) | GitHub Actions |
| --- | --- | --- |
| lint | ✅ | ✅ run #1 (`c1403ce`) |
| typecheck | ✅ | ✅ run #1 |
| unit test | ✅ 45/45 | ✅ run #2 45/45 (run #1 당시 32/32) |
| build | ✅ | ✅ run #1 |
| 로컬 Supabase 기동 + 마이그레이션 2개 | ✅ (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`) | ✅ run #1 (기본 레지스트리) |
| db lint / advisors | ✅ 0건 / 0건 | ✅ run #1 |
| 생성 타입 최신성 | ✅ | ✅ run #1 |
| integration test | ✅ 22/22 | ✅ run #1 22/22 (5 files) |
| HTTP 스모크 (`next start` + inline 실행) | ✅ 생성 201 → 대본 생성 202 → SCRIPT_REVIEW → 승인 202(장면 작업 3건) → 중복 승인 409 → 무인증 401 | 미실행 (CI 에 없음) |
| 변이 검사 (테스트가 회귀를 잡는지) | ✅ `cancel_scheduled_publication` 제거 시 무효화 테스트 실패 확인 후 원복 | 미실행 |
| 실제 Instagram 게시 / 유료 API | 미실행 (사용자 승인 전 금지) | 미실행 |

GitHub Actions run 링크: [run #1](https://github.com/Samingyeong/Reels-Automation-Platform/actions/runs/45533991362). 이후 커밋의 결과는 아래 표에 추가한다.

| run | 커밋 | verify | db-integration | 비고 |
| --- | --- | --- | --- | --- |
| #1 | `c1403ce` | ✅ | ✅ 22/22 | 경고: actions v4 의 Node 20 deprecated → v5 로 갱신 |
| [#2](https://github.com/Samingyeong/Reels-Automation-Platform/actions/runs/45534626173) | `eb7c698` | ✅ (unit 45) | ✅ 22/22, db lint·advisors·types diff 통과 | actions v5, 경고 없음 |
| [#3](https://github.com/Samingyeong/Reels-Automation-Platform/actions/runs/45534963543) | `3dbc0f1` | ✅ | ✅ | 문서 커밋 |
| [#4](https://github.com/Samingyeong/Reels-Automation-Platform/actions/runs/45540135784) | `5e91826` (M2) | ✅ (unit 48, build 에 Remotion 번들 포함) | ✅ 통합 28/28 (7 files, 실제 Remotion 렌더 포함) · E2E 2/2 | E2E 32.7초 |

### M2 — 2026-11-25

| 항목 | 로컬 (클라우드 개발 컨테이너) | GitHub Actions run #4 |
| --- | --- | --- |
| lint / typecheck / build | ✅ | ✅ |
| unit test | ✅ 48/48 (Trigger 디스패처, 계약, ops 포함) | ✅ 48/48 |
| db lint / advisors / 타입 최신성 (마이그레이션 3개) | ✅ 0 / 0 / 최신 | ✅ |
| integration test | ✅ 28/28 (`NODE_USE_ENV_PROXY=1` 필요, DR-013) | ✅ 28/28 |
| 실제 Remotion 렌더 (faststart·H.264·AAC) | ✅ | ✅ (Chromium headless shell 다운로드 포함 4.6초) |
| Playwright E2E (가입 → 대본 수정·승인 → 장면 개별 재생성 → 새로고침 유지 → 나레이션 개별 재녹음 → 실제 MP4 렌더·Storage → 렌더 후 장면 재생성 / 비로그인 차단) | ✅ 2/2 | ✅ 2/2 |
| 화면 확인 (데스크톱 1440, iPhone 13) | ✅ 스크린샷 확인, 모바일 가로 넘침 수정 | 미실행 |
| Trigger.dev 태스크 번들·로드 | ✅ esbuild 번들 → 3개 태스크 등록 확인 | 미실행 |
| Trigger.dev 클라우드 실행 | 미실행 (로그인·프로젝트 필요, DR-011) | 미실행 |
| 유료 API / 실제 Instagram 게시 | 미실행 (Mock 만 사용) | 미실행 |
