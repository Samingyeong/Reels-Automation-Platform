# 06. 개발 이슈 · 파일 소유권 · 병렬 작업 계획

## 1. 마일스톤 (각 단계는 독립적으로 검증 가능)

| 단계 | 목표 | 완료 기준(검증 방법) |
| --- | --- | --- |
| **M0** 기반·계약 ✅ | 템플릿, 상태 머신, 스키마, provider 인터페이스+Mock, DB 마이그레이션 초안, 문서, CLAUDE.md, skills, CI | `npm run ci` 통과, Remotion still 렌더 확인 |
| **M1** 데이터 계층 ✅ | Supabase 로컬, Auth, `project-service`(전이 실행), `apply_transition` RPC, Outbox 작업, 대본 API | 로컬·GitHub Actions 모두 통과: db lint/advisors 0건, 단위 45 + 통합 22 테스트, HTTP 스모크 ([07 §6](07-test-deploy.md#6-검증-기록)) |
| **M2** Mock 전체 흐름 ✅ | Trigger.dev 태스크, 스튜디오 UI(shadcn), 장면·나레이션 개별 수정·재생성, 렌더 → Storage | Playwright E2E: 가입 → 대본 수정·승인 → 장면 개별 재생성 → 새로고침 유지 → 나레이션 개별 재녹음 → 실제 MP4 렌더 → 렌더 후 장면 재생성. 예약 발행 UI 는 M4 로 이동 |
| **M3** Live 생성 | LLM·장면영상·TTS live provider, 비용 한도, 재사용 검증 | provider 계약 테스트, 스테이징 실호출 1회 (비용 승인 후) |
| **M4** Instagram 연동 | OAuth, Vault 토큰, live publisher, 한도 확인 | 테스트 계정에 **사용자 승인 후** 실제 게시 1회 |
| **M5** 성과·운영 | insights 수집, 대시보드, 토큰 갱신, 프로젝트 복제, 알림 | 스케줄 태스크 동작 확인 |

## 2. 이슈 목록

### M1 (완료)
- ✅ M1-1 Supabase 로컬(CLI v3, `config.jsonc`), 마이그레이션 2개, 타입 생성·CI 최신성 검사
- ✅ M1-2 `@supabase/ssr` 서버 클라이언트, Bearer 토큰 클라이언트, admin 클라이언트, `proxy.ts` 세션 갱신
- ✅ M1-3 `apply_transition` RPC + `claim_job`/`release_job_for_retry`/`cancel_job`/Outbox RPC
- ✅ M1-4 `project-service.dispatchUserEvent`: 소유권 → `transition()` → RPC → 커밋 후 디스패치
- ✅ M1-5 대본 콘텐츠 해시 + 승인 시 `CONTENT_CHANGED` 검증, 승인 버전·스냅샷 (scenes/final 해시는 M2)
- ✅ M1-6 서버 전용 모듈 보호: `server-only` 가드(`src/server/**`, provider registry). ESLint 규칙 대신 Next.js 빌드 오류로 강제
- ✅ M1-7 API: 프로젝트 생성/목록/상세, 대본 생성·수정·승인, 재시도 + 통합 테스트
- ✅ M1-8 작업 러너: lease 기반 1회 실행, 백오프 재시도, 시도 소진 시 `*_FAILED`, 변경된 프로젝트 작업 취소
- ✅ M1-9 provider 메타데이터·비용 추정·계약 테스트·비동기 Mock·장애 주입 (D-3/D-4 대비)

### M2 (완료)
- ✅ M2-1 Trigger.dev 설정(`trigger.config.ts`, CLI·SDK·build 4.8.10 고정, aptGet·additionalFiles·esbuildPlugin) + `TriggerDispatcher` + `sweep-outbox` — **클라우드 연결은 사용자 로그인 필요** (DR-011)
- ✅ M2-2 장면 영상·나레이션(자막 포함) 작업, 장면 단위 결과 반영 RPC (DR-012)
- ✅ M2-3 렌더: 사전 번들 + Node SSR, Storage 업로드, 규격 검증 테스트 (DR-013)
- ⏭ M2-4 Mock 예약 발행 → M4 로 이동 (발행 UI·publish 작업은 Instagram 연동과 함께)
- ✅ M2-5 UI: 로그인, 프로젝트 홈, 스튜디오(대본 편집·승인, 장면 그리드·인스펙터, 나레이션 행, 최종 미리보기, 렌더 결과)
- ✅ M2-6 진행 표시·실패 배너·재시도, 새로고침 후 상태 유지 (DR-014, Realtime 보류)
- ✅ M2-7 Playwright E2E + CI(실제 렌더·E2E 포함)

### M3
- M3-1 Claude 대본 provider (구조화 출력 → Script)
- M3-2 장면 영상 provider (스톡 검색 1종 + AI 생성 1종 비교)
- M3-3 TTS provider (타이밍 포함) + 오디오 길이 기반 장면 길이 조정
- M3-4 사용자별 일일 생성 한도, 비용 기록·대시보드
- M3-5 렌더 성능 측정(Trigger.dev large-1x), 필요 시 Lambda 대체 검토
- M3-0 **Trigger.dev 클라우드 연결** (사용자 로그인 → 프로젝트 ref·secret key) 후 dev 환경 실실행 검증

### M4
- M4-0 예약 설정 UI + publish 작업(Mock publisher 로 먼저 검증)
- M4-1 Instagram Login OAuth + Vault 저장 + 장기 토큰 갱신 태스크
- M4-2 live publisher + 컨테이너 상태 폴링 + 한도 확인
- M4-3 발행 실패 복구 UX (게시 여부 확인 → 재예약/정정)
- M4-4 **실제 게시 테스트 (사용자 승인 필수)**

### 결정 (D) — 상세는 [decisions.md](decisions.md)
- ✅ D-1 Remotion: 무료 라이선스 (DR-001, 재검토 조건 기록)
- ✅ D-2 Instagram: 공식 문서 검증 완료, Instagram Login 채택 (DR-002, DR-003)
- ⏸ D-3 장면 영상 provider: 미확정, 평가 기준 고정 (DR-004) — M2 이후 평가
- ⏸ D-4 TTS provider: 미확정, 평가 기준 고정 (DR-004) — M2 이후 평가
- D-5 Trigger.dev Cloud 플랜 / 머신 크기 (렌더 시간 측정 후)

## 3. 파일 소유권

공통 계약(★)은 **리드만 변경**한다. 병렬 작업자는 계약을 import 만 하고, 변경이 필요하면 아래 절차를 따른다.

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| ★ `src/domain/**` | 리드 | 상태 머신·스키마·해시 |
| ★ `src/providers/types.ts`, `registry.ts` | 리드 | |
| ★ `supabase/migrations/**` | 리드 (DB 담당) | 한 번에 한 명만 새 마이그레이션 작성 |
| `src/providers/<name>/**` | provider 담당자별 | 서로 독립 → 병렬 가능 |
| `src/server/**` | 백엔드 | |
| `src/trigger/<task>.ts` | 태스크별 담당 | 태스크끼리 독립 → 병렬 가능 |
| `src/app/api/**` | 백엔드 | 라우트 폴더 단위로 분할 가능 |
| `src/app/(app)/**`, `src/components/**` | 프론트엔드 | 화면 단위로 분할 가능 |
| `src/remotion/**` | 영상 담당 | props 는 ★ schemas 를 따름 |
| `.github/**`, `CLAUDE.md`, `.claude/**` | 리드 | |

### 계약 변경 절차
1. 이슈에 변경 제안(이유, 영향 범위) → 2. 리드가 `src/domain`/`types.ts` 수정 + 테스트 → 3. 머지 후 의존 작업 리베이스.

## 4. 병렬 가능한 작업 묶음

의존성: M1-1 → M1-3 → M1-4 → (API, 태스크) / 계약(M0) 은 이미 고정.

- 병렬 그룹 A (M1 이후): M2-2 태스크들 · M2-5 UI 화면들 · M2-3 렌더 — 서로 다른 파일만 수정
- 병렬 그룹 B (M3): M3-1 / M3-2 / M3-3 provider 는 완전 독립 (각자 `src/providers/<name>`)
- 순차 필수: 마이그레이션, `project-service`, 공통 계약

병렬 작업자는 git worktree 로 분리하고 자기 소유 경로 외 파일을 수정하면 PR 에서 리드 리뷰를 받는다.
