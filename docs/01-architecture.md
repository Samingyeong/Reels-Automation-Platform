# 01. 아키텍처

## 1. 구성도

```
┌──────────────── Browser ────────────────┐
│ Next.js 페이지 (shadcn/ui)               │
│  · @remotion/player 미리보기             │
│  · Supabase Realtime 으로 진행 상태 구독 │
└───────────────┬─────────────────────────┘
                │ fetch (쿠키 세션)
┌───────────────▼──────────── Vercel ─────────────────────────┐
│ Next.js Route Handlers  /api/**                              │
│  1) Supabase Auth 로 사용자 확인 + 소유권 검증               │
│  2) pipeline.transition() 으로 전이 가능 여부 판단           │
│  3) transition_project() RPC (낙관적 잠금) + 부수효과 실행   │
│  4) ENQUEUE → tasks.trigger(..., { idempotencyKey })         │
└───────┬───────────────────────────────┬─────────────────────┘
        │ service_role                  │ Trigger.dev SDK
┌───────▼────────┐             ┌────────▼──────────────── Trigger.dev ─────────┐
│ Supabase       │◄────────────┤ tasks: generate-script, generate-scene-video, │
│  Postgres(RLS) │ service_role│        generate-narration, render-reel,       │
│  Storage(media)│             │        publish-reel, collect-insights          │
│  Auth/Realtime │             │ providers/* (Mock | Live)                       │
└────────────────┘             └──────────────┬─────────────────────────────────┘
                                              │ HTTPS (서버에서만)
                                   LLM · 영상 생성 · TTS · Instagram Graph API
```

## 2. 핵심 원칙

1. **DB 가 단일 진실 공급원.** 상태는 `projects.status` 에만 있고, 워커는 결과를 DB 에 기록한 뒤 이벤트를 보고한다. Trigger.dev 런 상태를 UI 에 직접 신뢰하지 않는다.
2. **승인 게이트.** `APPROVE_SCRIPT` / `APPROVE_SCENES` / `APPROVE_FINAL` 만이 다음 생성 단계를 큐에 넣는다. 예약 설정(`SCHEDULE`)이 발행에 대한 승인이다.
3. **승인은 콘텐츠 해시에 묶인다.** 승인 API 는 클라이언트가 보고 있던 `contentHash` 를 받아 서버가 계산한 현재 해시와 비교한다. 다르면 409 → 사용자가 본 적 없는 내용을 승인하는 일이 없다.
4. **멱등성 2중화.** (a) `jobs.idempotency_key` 부분 유니크 인덱스 (b) Trigger.dev global idempotency key. 키는 `jobInputKey(kind, provider, input)` → 같은 입력은 외부 API 를 다시 부르지 않고 기존 asset 재사용.
5. **장시간 작업은 전부 Trigger.dev.** Route Handler 는 수 초 안에 응답한다. 렌더는 대형 머신 + 재시도.
6. **API 키는 서버 전용.** `src/providers/**`, `src/server/**`, `src/trigger/**` 만 `process.env` 의 비밀값을 읽는다. 클라이언트 번들 import 금지(ESLint 규칙으로 강제 예정, 이슈 M1-6).
7. **Mock 우선.** `PROVIDER_MODE=mock`, `PUBLISH_MODE=mock` 이 기본. live 는 명시적으로 켜야 하며 미구현 live 는 에러(조용한 fallback 금지).

## 3. 디렉터리 구조 (목표)

```
src/
  app/                     Next.js App Router (페이지, /api 라우트)
  components/ui/           shadcn/ui 생성 컴포넌트
  domain/                  ★ 공통 계약: pipeline(상태머신), schemas(zod), hash  — 순수 TS
  providers/               ★ 공통 계약: types.ts / mock / live 구현 / registry
  server/                  서버 전용 서비스: supabase admin client, project-service(전이 실행), storage
  trigger/                 Trigger.dev 태스크
  remotion/                Remotion 컴포지션 (Player·렌더 공유)
supabase/migrations/       SQL 마이그레이션
docs/                      설계 문서
.claude/skills/            프로젝트 전용 Agent Skills
```

## 4. 주요 흐름

### 4.1 승인 → 다음 단계 실행
1. `POST /api/projects/:id/scenes/approve { contentHash, revision }`
2. 서버: 사용자·소유권 확인 → 현재 장면들의 해시 계산 → `contentHash` 일치 확인 → 모든 장면 `visual_status = ready` 확인
3. `transition(status, APPROVE_SCENES)` → `{ to: NARRATION_GENERATING, effects: [RECORD_APPROVAL, ENQUEUE narration] }`
4. 단일 DB 트랜잭션(`apply_transition` RPC): 상태 전이(revision 검사) + 승인 버전 기록 + jobs insert(queued)
5. 커밋 후 `JobDispatcher.dispatch(jobIds)` → `jobs.dispatched_at` 기록. M1: `inline`(Next `after()`로 응답 후 실행) / `none`, M2: `tasks.trigger(..., { idempotencyKey })` → `jobs.trigger_run_id`
   - 전달 실패 시 job 은 `queued` 로 남고, 스윕(`drainOutbox` → `list_dispatchable_jobs`)이 재전달한다 (outbox 패턴, [DR-008](decisions.md#dr-008-원자적-상태-전이--outboxjobs-디스패치)).
6. 실행: `runJob()` → `claim_job` lease(1회 실행) → provider 호출 → 결과 저장·상태 전이·작업 완료를 `apply_transition` 한 번으로. 일시 오류는 백오프 재시도, 소진/영구 오류는 `*_FAILED`.

### 4.2 장면 단위 재생성
- `REGENERATE_SCENES { sceneIds }` → 해당 장면만 `visual_status=generating`, 장면 job 만 큐잉.
- 워커는 장면 하나 완료 시 `aggregateSceneStatuses()` 로 전체 집계 → 전부 ready 면 `SCENES_SUCCEEDED` 보고.

### 4.3 렌더
- final 승인 시점의 `ReelCompositionProps` 스냅샷과 `composition_hash` 를 `renders` 에 저장.
- `render-reel` 태스크: Remotion 번들(빌드 시 생성된 정적 번들 사용) → `selectComposition` → `renderMedia(h264)` → Storage `media/{user}/{project}/render/{renderId}.mp4` 업로드 → `assets` 기록 → `RENDER_SUCCEEDED`.
- 장면 영상·오디오는 Storage signed URL 로 컴포지션에 전달(렌더 시간 + 여유로 만료 설정).

### 4.4 예약 발행
- `POST /api/projects/:id/publications { scheduledAt, caption, instagramAccountId }`
- publications insert(부분 유니크로 렌더당 활성 발행 1개) → `tasks.trigger("publish-reel", { publicationId }, { delay: scheduledAt, idempotencyKey: global("publish:"+publicationId) })`
- 예약 변경: `runs.reschedule`, 취소: `runs.cancel` + `status=canceled`.
- `publish-reel` 실행 순서와 중복 방지
  1. publication 행을 `scheduled → publishing` 으로 조건부 업데이트 (0행이면 종료: 이미 처리됨/취소됨)
  2. `ig_container_id` 가 없으면 컨테이너 생성 후 **즉시 저장**, 있으면 재사용
  3. `status_code` 폴링(`wait.for` 사용, 최대 N분)
  4. `ig_media_id` 가 없을 때만 `media_publish` 호출 → 즉시 저장
  5. permalink 조회 후 `published`. 4 단계 이후의 실패는 "게시됨 + 메타데이터 조회 실패"로 기록하고 재게시하지 않는다.
- 발행 전 `content_publishing_limit` 확인. 한도 초과 시 `PUBLISH_FAILED`(재예약 필요).

### 4.5 성과 수집
- `collect-insights` 스케줄 태스크: 게시 후 1h, 24h, 72h, 7d 시점 + 이후 일 1회(30일까지). 결과는 `media_insights` 에 append.

## 5. 렌더링 위치 결정

| 옵션 | 장점 | 단점 | 결정 |
| --- | --- | --- | --- |
| Trigger.dev 워커 + `@remotion/renderer` | 스택 일치, 재시도·큐·모니터링 내장, AWS 불필요 | 단일 머신 렌더(Lambda 대비 느림), Chromium 의존성 빌드 설정 필요 | **채택** |
| Remotion Lambda | 가장 빠름(분산) | AWS 계정·IAM·버전별 재배포 필요 | 대체 경로. 렌더 시간 > 5분이 일상화되면 재검토 |
| Vercel Sandbox | Vercel 일원화 | 신규 기능, 한도 확인 필요 | 보류 |

`RenderProvider` 인터페이스 뒤에 두어 교체 가능하게 한다 (M3).

## 6. 보안

- Supabase `service_role` 키, provider API 키, Instagram 토큰: 서버/워커 환경변수 또는 Vault. `NEXT_PUBLIC_` 접두사 금지.
- Instagram 액세스 토큰은 Supabase Vault 에 저장하고 `instagram_accounts.access_token_secret_id` 만 보관. 장기 토큰 만료 전 갱신 태스크.
- Storage 버킷 `media` 는 비공개. 미리보기·Instagram 전달은 짧은 만료의 signed URL.
- Route Handler 는 모든 입력을 zod 로 검증, 사용자 이벤트로 워커 전용 이벤트(`*_SUCCEEDED` 등)를 받지 않는다(`isWorkerOnlyEvent`).
- 사용자별 생성 요청 rate limit(일 단위 job 수 제한)으로 비용 폭주 방지 (M3).
