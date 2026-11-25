# 06. 개발 이슈 · 파일 소유권 · 병렬 작업 계획

## 1. 마일스톤 (각 단계는 독립적으로 검증 가능)

| 단계 | 목표 | 완료 기준(검증 방법) |
| --- | --- | --- |
| **M0** 기반·계약 ✅ | 템플릿, 상태 머신, 스키마, provider 인터페이스+Mock, DB 마이그레이션 초안, 문서, CLAUDE.md, skills, CI | `npm run ci` 통과, Remotion still 렌더 확인 |
| **M1** 데이터 계층 | Supabase 로컬, Auth, `project-service`(전이 실행), `apply_transition` RPC, API 라우트(대본까지) | `supabase db reset` 성공, 서비스 통합 테스트(로컬 Supabase), API 테스트 |
| **M2** Mock 전체 흐름 | Trigger.dev 태스크(Mock), 검수 UI(shadcn), Realtime, 장면 재생성, 렌더 → Storage | Playwright E2E: 주제 입력 → 3회 승인 → 렌더 MP4 Storage 저장 → Mock 예약 발행 |
| **M3** Live 생성 | LLM·장면영상·TTS live provider, 비용 한도, 재사용 검증 | provider 계약 테스트, 스테이징 실호출 1회 (비용 승인 후) |
| **M4** Instagram 연동 | OAuth, Vault 토큰, live publisher, 한도 확인 | 테스트 계정에 **사용자 승인 후** 실제 게시 1회 |
| **M5** 성과·운영 | insights 수집, 대시보드, 토큰 갱신, 프로젝트 복제, 알림 | 스케줄 태스크 동작 확인 |

## 2. 이슈 목록

### M1
- M1-1 Supabase 로컬 설정(`supabase init`), 마이그레이션 적용 검증, 타입 생성
- M1-2 `@supabase/ssr` 클라이언트(server/browser/admin) + 미들웨어 세션 갱신
- M1-3 `apply_transition` RPC (전이 + 승인 기록/취소 + job insert + stale 처리 단일 트랜잭션)
- M1-4 `src/server/project-service.ts`: `dispatch(projectId, event, actor)` — pipeline.transition → RPC → 커밋 후 enqueue
- M1-5 콘텐츠 해시 계산기(script/scenes/final) + 승인 API 의 contentHash 검증
- M1-6 ESLint 규칙: client 컴포넌트에서 `src/providers`, `src/server`, `src/trigger` import 금지
- M1-7 프로젝트 생성/조회/대본 API + 테스트

### M2
- M2-1 Trigger.dev 설정(`trigger.config.ts`, 버전 고정, Remotion 빌드 확장)
- M2-2 `generate-script`, `generate-scene-video`, `generate-narration` 태스크 (Mock)
- M2-3 `render-reel` 태스크: 번들 전략(빌드 시 번들 → additionalFiles) + Storage 업로드
- M2-4 `publish-reel`(Mock) + 예약/변경/취소 + `requeue-stuck-jobs`
- M2-5 UI: 프로젝트 목록, 대본 편집·승인, 장면 그리드(개별 재생성), 최종 미리보기(Player), 예약 폼
- M2-6 Realtime 구독 훅, 진행률 표시, 실패 메시지·재시도 버튼
- M2-7 Playwright E2E (Mock 전체 흐름)

### M3
- M3-1 Claude 대본 provider (구조화 출력 → Script)
- M3-2 장면 영상 provider (스톡 검색 1종 + AI 생성 1종 비교)
- M3-3 TTS provider (타이밍 포함) + 오디오 길이 기반 장면 길이 조정
- M3-4 사용자별 일일 생성 한도, 비용 기록·대시보드
- M3-5 `RenderProvider` 추상화, 렌더 성능 측정

### M4
- M4-1 Instagram Login OAuth + Vault 저장 + 장기 토큰 갱신 태스크
- M4-2 live publisher + 컨테이너 상태 폴링 + 한도 확인
- M4-3 발행 실패 복구 UX (게시 여부 확인 → 재예약/정정)
- M4-4 **실제 게시 테스트 (사용자 승인 필수)**

### 결정 필요 (D)
- D-1 Remotion Company License 필요 여부 (팀 규모·수익 기준)
- D-2 Instagram 공식 문서 재검증 (현 세션 네트워크 정책상 접근 불가)
- D-3 장면 영상 provider 선택 (비용 vs 품질)
- D-4 TTS provider·기본 보이스 선택
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
