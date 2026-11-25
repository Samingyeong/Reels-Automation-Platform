# 07. 테스트 · 배포 전략

## 1. 테스트 피라미드

| 레벨 | 도구 | 대상 | CI |
| --- | --- | --- | --- |
| 단위 | Vitest | `src/domain`(상태 머신 전수), 해시, mock provider, 스키마 | ✅ 매 PR |
| Provider 계약 | Vitest | 모든 provider 가 같은 계약 테스트 통과. live 는 녹화된 응답(fixture)으로 | ✅ (live 실호출 제외) |
| 서비스 통합 | Vitest + 로컬 Supabase(`supabase start`) | `project-service.dispatch`, RPC, RLS(타 사용자 접근 차단) | ✅ M1 부터 (Docker) |
| 태스크 | Vitest + Trigger.dev 로컬 dev / 태스크 함수 직접 호출 | 재시도·멱등성(같은 키 두 번 → 외부 호출 1회) | ✅ M2 부터 |
| 렌더 | Remotion `still` / 짧은 `render` | 컴포지션 회귀 (프레임 스냅샷) | 선택 (nightly) |
| E2E | Playwright (`webapp-testing` skill) | Mock 전체 흐름 | ✅ M2 부터 |
| 실호출 | 수동 | live provider, Instagram 게시 | ❌ CI 금지, **사용자 승인 후 수동** |

필수 테스트 시나리오
- 승인 없이 다음 단계 불가 / 수정 시 승인 초기화 / 특정 장면만 재생성
- 같은 입력 재생성 시 외부 API 호출 0회
- `publish-reel` 을 두 번 트리거해도 게시 1회, 컨테이너 생성 후 크래시 → 재실행 시 컨테이너 재사용
- 워커 실패 → `*_FAILED` 표시, 성공 상태로 가지 않음
- 다른 사용자의 프로젝트 조회/조작 불가 (RLS + API 404)

## 2. CI (GitHub Actions)

`.github/workflows/ci.yml`: `npm ci` → `lint` → `typecheck` → `test` → `build`. Node 22. 비밀값 없이 통과해야 한다 (Mock 기본).
M1 이후 job 추가: `supabase start` 후 통합 테스트, `supabase db lint`.

## 3. 환경

| 환경 | Web | 워커 | DB | Provider |
| --- | --- | --- | --- | --- |
| local | `next dev` | `npx trigger.dev dev` | `supabase start` | mock |
| preview | Vercel Preview | Trigger.dev `staging` | Supabase 스테이징 프로젝트(또는 branching) | mock (live 는 수동 토글) |
| production | Vercel Production | Trigger.dev `prod` | Supabase 프로덕션 | live, `PUBLISH_MODE=live` 는 M4-4 승인 후 |

## 4. 배포 순서

1. DB: `supabase db push` (마이그레이션 먼저, 하위 호환 유지)
2. 워커: `npx trigger.dev deploy --env <env>` (CLI·SDK·build 버전 동일)
3. Web: Vercel Git 연동 자동 배포
4. 스모크: 헬스 체크 + Mock 프로젝트 1건 흐름

롤백: Vercel 이전 배포 promote, Trigger.dev 이전 버전 promote. 마이그레이션은 forward-only (되돌림은 새 마이그레이션).

## 5. 환경 변수

`.env.example` 참조. `NEXT_PUBLIC_` 접두사는 Supabase URL·anon key 만. 나머지는 Vercel/Trigger.dev 환경변수(서버 전용)로 관리하며 Trigger.dev 는 `syncEnvVars` 대신 대시보드에서 명시적으로 관리한다.
