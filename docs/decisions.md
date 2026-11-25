# 결정 기록 (Decision Records)

형식: 상태 · 결정 · 근거(공식 문서 인용, 확인일) · 영향 · **재검토 조건**.
결정이 바뀌면 기존 항목을 지우지 않고 `대체됨(→ DR-xxx)` 으로 표시한다.

| ID | 제목 | 상태 |
| --- | --- | --- |
| DR-001 | Remotion 무료 라이선스 사용 | 채택 |
| DR-002 | Instagram 인증: Instagram API with Instagram Login | 채택 |
| DR-003 | Instagram 발행 정책(한도·컨테이너·재시도·규격) | 채택 |
| DR-004 | 장면 영상·TTS provider 미확정, 평가 기준 고정 | 채택 (선정 보류) |
| DR-005 | 유료 호출 가드와 Mock 우선 | 채택 |
| DR-006 | 의존성 충돌 해결 (legacy-peer-deps 제거) | 채택 |
| DR-007 | 공식 Agent Skills / Remotion 플러그인 설치 방식 | 채택 |
| DR-008 | 원자적 상태 전이 + Outbox(jobs) 디스패치 | 채택 |
| DR-009 | DB 보안 모델 (명시적 GRANT, service_role 전용 RPC) | 채택 |
| DR-010 | 로컬 Supabase: CLI v3, Docker Hub 이미지 | 채택 |
| DR-011 | 백그라운드 작업 Trigger.dev 이전 방식 | 채택 (클라우드 연결은 계정 필요) |
| DR-012 | 장면 단위 작업 키·결과 반영·재사용 | 채택 (DR-008 보완) |
| DR-013 | 렌더: Remotion 사전 번들 + Node SSR | 채택 |
| DR-014 | 진행 상태 표시: DB 폴링 (Realtime 보류) | 채택 |

---

## DR-001 Remotion 무료 라이선스 사용

- **상태**: 채택 (2026-11-25, 사용자 결정 D-1)
- **결정**: 개인 개발·콘텐츠 수익화 목적이므로 Remotion **Free License** 로 진행한다. `licenseKey` 는 설정하지 않는다(`null`).
- **근거** (2026-11-25 확인)
  - [License & Pricing](https://www.remotion.dev/docs/license/pricing): "Free License — For individuals and companies of up to 3 people. Create and automate, all features included, unlimited commercial use."
  - [License FAQ](https://www.remotion.dev/docs/license/faq): 무료 대상 "an individual, whether for personal or commercial use" / "Can I make money under the Free License? … no difference … when it comes to commercial usage" / "you don't need to buy a license - even if you set up an automation, launch a SaaS, or are using it commercially" / 1인 법인도 "total headcount is 3 or less" 면 무료.
  - [Telemetry](https://www.remotion.dev/docs/telemetry), FAQ: 서버 사이드 렌더 텔레메트리는 Free License 사용자에게 **자발적**. Remotion 5.0 에서 의무화되는 대상은 "Remotion for Automators" 회사 라이선스뿐.
  - [Terms](https://www.remotion.dev/docs/terms): 회사 라이선스 사용자는 사용량 초과 시 30일 유예. (무료 대상에는 해당 없음)
- **영향**: 렌더 태스크(M2)는 `licenseKey: null` 로 호출. Player 미리보기는 렌더로 집계되지 않음(FAQ "Previews in the Remotion Studio or Remotion Player do not count as Renders").
- **재검토 조건** (하나라도 해당하면 다시 판단)
  1. 프로젝트에 관여하는 인원(공동 창업자·직원·외주 포함 headcount)이 **4명 이상**이 되는 경우 → Company License 필요. 자동화 서비스는 "Remotion for Automators"($0.01/render, 월 최소 $100) 대상.
  2. 법인 설립·투자 유치 등으로 소속 조직이 3인 초과 회사가 되는 경우.
  3. Remotion 메이저 업그레이드(5.0) 시 라이선스·텔레메트리 조건 변경 확인.
  4. 비영리 단체 등 예외 조직으로 전환하는 경우 FAQ 의 서면 허가 대상 여부 확인.

## DR-002 Instagram 인증: Instagram API with Instagram Login

- **상태**: 채택 (2026-11-25, D-2)
- **비교** (출처: [Instagram Platform Overview](https://developers.facebook.com/docs/instagram-platform/overview), [Unified Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login), [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing), 2026-11-25)

| | Instagram Login | Facebook Login | Unified Login (신규 권장) |
| --- | --- | --- | --- |
| 로그인 | Instagram 계정 | Facebook 계정 | Instagram 또는 Facebook |
| Facebook 페이지 | 불필요 | **필요** (페이지 관리자 권한) | 불필요 |
| 비즈니스 포트폴리오 | 불필요 | 구성에 따라 | **필요** |
| 토큰 | Instagram User access token | Facebook User/Page token | Business Integration System User token |
| 호스트 | `graph.instagram.com` | `graph.facebook.com` (+`rupload.facebook.com`) | `graph.facebook.com` |
| 발행 권한 | `instagram_business_basic`, `instagram_business_content_publish` | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+경우에 따라 `ads_management`, `ads_read`) | `instagram_basic`, `instagram_content_publish` |
| 성과 권한 | `instagram_business_manage_insights` | `instagram_manage_insights` | – |
| 대용량 resumable 업로드 | 미지원 (video_url 만) | 지원 | 지원 |
| 대상 계정 | 비즈니스·크리에이터(프로페셔널) | 페이지 연결된 프로페셔널 | 프로페셔널 |

- **결정**: **Instagram API with Instagram Login (Business Login for Instagram)**.
  - 개인 크리에이터 1계정 자동 발행에 페이지·비즈니스 포트폴리오가 필요 없는 가장 단순한 경로.
  - 문서: "If your app only serves your Instagram professional account or an account you manage, **Standard Access** is all your app needs." → 앱 리뷰·비즈니스 인증(Advanced Access) 불필요. 앱 역할(관리자/테스터)에 본인 계정을 등록해 사용.
  - 문서: "If your app serves only your Instagram professional accounts … you do not need to implement a login flow" — MVP 는 App Dashboard 에서 발급한 장기 토큰을 등록하는 방식도 가능하나, 갱신 자동화와 다계정 확장을 위해 OAuth 콜백(M4-1)도 구현한다.
- **토큰 수명·갱신** ([Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login), [refresh_access_token](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token))
  - 인가 코드: **1시간**, 1회용. `POST https://api.instagram.com/oauth/access_token` (`grant_type=authorization_code`) → 단기 토큰.
  - 장기 토큰: `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token` → **60일**.
  - 갱신: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` — 토큰이 **최소 24시간 지났고 만료 전**이어야 함, 갱신 시점부터 60일. "Tokens that have not been refreshed in 60 days will expire and can no longer be refreshed."
  - 운영: 매일 스케줄 태스크가 만료 **10일 전** 토큰을 갱신, 실패 시 사용자 알림 + 예약 발행 사전 점검에서 차단. 토큰은 Supabase Vault 저장.
  - 스코프 이름: 구 `business_*` 스코프는 2025-01-27 폐지 → 반드시 `instagram_business_*` 사용.
- **재검토 조건**: (1) 다른 사람의 계정을 서비스하게 되는 경우(Advanced Access + App Review + Business Verification 필요), (2) Unified Login 전용 신기능("New Instagram API features are released only for this setup")이 필요한 경우, (3) 300MB 초과 영상·불안정 네트워크로 resumable 업로드가 필요한 경우.

## DR-003 Instagram 발행 정책

- **상태**: 채택 (2026-11-25). 출처: [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing), [IG User Media](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media), [Content Publishing Limit](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit), [Error Codes](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/error-codes). Graph API 최신 버전 v27.0.
- **절차**: `POST /<IG_ID>/media` (`media_type=REELS`, `video_url`, `caption`, `share_to_feed`, 선택 `cover_url`/`thumb_offset`/`is_ai_generated`) → `GET /<CONTAINER_ID>?fields=status_code` → `POST /<IG_ID>/media_publish` (`creation_id`) → 미디어 ID.
- **발행 한도**: 문서 간 수치 불일치 — 가이드 본문 "**100** API-published posts within a 24-hour moving period", `content_publishing_limit` 레퍼런스 "`quota_total` … (currently **50**)", `quota_duration` 86400초.
  → **하드코딩하지 않는다.** 발행 직전 `GET /<IG_ID>/content_publishing_limit?fields=quota_usage,config` 응답의 `config.quota_total` 을 기준으로 판단하고, 앱 자체 한도는 보수적으로 **일 25건**(개인 MVP)으로 둔다. 한도 초과 오류(코드 9 / 2207042)는 재시도하지 않고 다음날 재예약 안내.
- **컨테이너**: 24시간 내 미발행 시 `EXPIRED`. 상태값 `EXPIRED`/`ERROR`/`FINISHED`/`IN_PROGRESS`/`PUBLISHED`. 권장 폴링 "**once per minute, for no more than 5 minutes**".
  → 발행 태스크는 예약 시각에 컨테이너를 생성(미리 만들지 않음, 만료 방지)하고 1분 간격 최대 5회 폴링. 5분 초과 시 컨테이너 ID 를 저장한 채 15분 후 1회 재확인, 그래도 `IN_PROGRESS` 면 실패 처리.
- **실패 복구** (오류 코드 → 처리)

| 코드/서브코드 | 의미 | 처리 |
| --- | --- | --- |
| 9007 / 2207027 | 미디어 준비 안 됨 | 상태 폴링 후 `FINISHED` 에서 publish (재시도) |
| 24 / 2207008 | 컨테이너 일시 오류 | 30초~2분 내 1~2회 재시도, 실패 시 **새 컨테이너** |
| -2 / 2207003 | 미디어 다운로드 타임아웃 | signed URL 재발급 후 새 컨테이너 1회 |
| -2 / 2207020 | 컨테이너 만료 | 새 컨테이너 |
| -1 / 2207001, 2207032, 2207053 | 서버/업로드 오류 | 새 컨테이너로 1회 재시도 |
| 9004 / 2207052 | URL 에서 가져오기 실패 | signed URL 만료·공개 여부 점검, 재시도 1회 |
| 352 / 2207026 | 영상 포맷 미지원 | **재시도 안 함** (렌더 설정 버그) |
| 9 / 2207042 | 일일 발행 한도 | **재시도 안 함**, 재예약 |
| 4 / 2207051 | 스팸 의심 제한 | **재시도 안 함**, 사용자 확인 |
| 25 / 2207050 | 계정 제한 | **재시도 안 함**, 앱에서 계정 조치 안내 |
| 24 / 2207006 | 권한/토큰 문제 | 토큰 갱신 시도 후 1회, 실패 시 재연결 요구 |

  공통 원칙: `media_publish` 호출 **이후**의 불확실한 실패(타임아웃 등)는 재게시하지 않는다. 컨테이너 `status_code=PUBLISHED` 또는 최근 미디어 조회로 게시 여부를 먼저 확인한다(중복 게시 방지).
- **영상 규격** (Reels): MOV/MP4, moov atom 앞쪽(faststart), edit list 없음 · H.264/HEVC, progressive, closed GOP, 4:2:0 · AAC ≤48kHz, mono/stereo, 128kbps · 23–60fps · 가로 최대 1920px · 비율 0.01:1~10:1 (권장 9:16) · VBR 최대 25Mbps · **3초~15분** · **최대 300MB**. 커버: JPEG, ≤8MB, sRGB, 권장 9:16.
  → 렌더 기본값: 1080×1920, 30fps, H.264(yuv420p), AAC 48kHz 128kbps, 길이 5~90초(도메인 `MIN/MAX_TOTAL_SEC`). 렌더 후 ffprobe 로 규격 검증(M2-3), 실패 시 발행 차단.
- **캡션**: 최대 2,200자, 해시태그 30개, @태그 20개 (도메인 `Script` 스키마와 일치).
- **AI 표시**: AI 생성 콘텐츠이므로 컨테이너 생성 시 `is_ai_generated=true` 를 기본값으로 보낸다.
- **예약**: API 에 예약 게시 기능이 없음 → Trigger.dev 지연 실행으로 구현 (기존 설계 유지).
- **미디어 접근**: "We cURL media … must be hosted on a publicly accessible server" → 비공개 버킷의 signed URL(만료 2시간) 사용. Instagram Login 은 resumable 업로드 미지원.
- **성과 지표** (Reels): `views`, `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`, `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time`, `reels_skip_rate`, `reposts`. `impressions` 는 2024-07-02 이후 생성 미디어에서 폐지. `total_*` 계열은 Facebook Login 전용.
- **실제 발행 테스트**: 별도 사용자 승인 후 M4-4 에서만 수행. `PUBLISH_MODE=live` 기본값 금지.

## DR-004 장면 영상·TTS provider: 미확정, 평가 기준 고정

- **상태**: 채택 — 특정 서비스 선정은 보류 (D-3, D-4)
- **결정**: provider 인터페이스 + Mock 을 먼저 완성하고, 후보는 아래 기준으로 평가해 `docs/05-providers.md` 의 평가표에 기록한 뒤 선정한다.
- **평가 기준** (가중치는 개인 MVP 기준)

| 기준 | 가중치 | 측정 방법 |
| --- | --- | --- |
| 한국어 지원·결과 품질 | 25% | 고정 샘플 대본 5개로 생성 → 블라인드 1~5점 |
| 상업적 이용 가능 여부 | 필수(pass/fail) | 약관 원문 링크·확인일 기록 (`ProviderInfo.commercialUse`) |
| 영상 1개(30초, 6장면)당 비용 | 20% | `estimateCostUsd` 합계 + 실측 청구액 |
| API 연동 복잡성 | 10% | 인증·업로드·폴링 단계 수, SDK 유무 |
| 생성 소요 시간 | 15% | 장면당 p50/p95 |
| 장면 단위 재생성 | 필수(pass/fail) | `ProviderInfo.perSceneGeneration` |
| 비동기 처리·실패 복구 | 15% | 작업 ID 기반 재조회 가능 여부(`async`, `poll`), 오류 코드 구분 |
| 한도·안정성 | 15% | 레이트 리밋, 장애 이력 |

- **코드 반영**: `ProviderInfo`(언어, 상업적 이용, async, 장면 단위 생성, 근거 URL), `estimateCostUsd()`, 공용 계약 테스트(`src/providers/contract.ts`), 비동기 Mock(`createAsyncMockSceneVideoProvider`), 장애 주입 표식(`[mock:fail-retryable]`, `[mock:fail-fatal]`).
- **재검토 조건**: M2 완료(Mock 전체 파이프라인 동작) 후 후보 2~3개 평가. 유료 평가 호출 전 예상 비용을 사용자에게 보고하고 승인받는다 (DR-005).

## DR-005 유료 호출 가드와 Mock 우선

- **결정**: `PROVIDER_MODE`, `PUBLISH_MODE` 기본값 `mock`. 미구현 live 요청은 예외(조용한 대체 금지). CI 는 항상 mock. 유료 API 첫 실호출 전 예상 비용(`estimateCostUsd` × 건수)을 보고하고 사용자 승인을 받는다. live 모드에서는 사용자별 일일 예산 한도를 둔다(M3-4).
- **근거**: 사용자 요구 "실제 API 호출 및 유료 리소스 사용 전에 비용 발생 여부를 확인한다", "유료 API 호출 없이 전체 파이프라인을 테스트할 수 있어야 한다".

## DR-006 의존성 충돌 해결 (legacy-peer-deps 제거)

- **상태**: 채택 (2026-11-25). `.npmrc` 의 `legacy-peer-deps=true` **제거 완료**.
- **원인 분석**
  1. **피어 충돌(실제 충돌)**: `@remotion/eslint-plugin@4.0.547`(최신)이 `@typescript-eslint/utils@5.19.0` 을 고정 의존 → 그 피어가 `eslint ^6 || ^7 || ^8` 이라 eslint 9 와 불일치. 플러그인은 `ESLintUtils.RuleCreator` 만 사용하며 v8 에서도 동일 API.
     → `package.json` `overrides`: `"@remotion/eslint-plugin": { "@typescript-eslint/utils": "8.73.0" }` (범위를 해당 패키지로 한정). Remotion 규칙 동작 확인(`@remotion/warn-native-media-tag`, `@remotion/no-string-assets` 위반 감지).
  2. **npm 10 크래시(도구 버그)**: `npm install` 이 `Cannot read properties of null (reading 'edgesOut')` 로 실패. 스택은 arborist `#loadPeerSet` — Vitest 의 선택적 피어 체인(`vite` → `@vitejs/devtools` → `vitest@*`)을 따라가다 발생. 버전 충돌이 아니라 npm 10.9 의 피어 세트 처리 버그로, **npm 11.21.3 에서 동일 트리를 오류 없이 해석**(invalid/unmet 0건).
     → `packageManager: "npm@11.21.3"`, `engines.npm >= 11`, CI 도 npm 11 설치. 참고로 npm 10 의 `npm ci`(락파일 설치)는 정상 동작.
  3. 정리: Next 16 과 맞지 않던 `eslint-config-next@15`, 미사용 `@typescript-eslint/*`, `@eslint/eslintrc`, `autoprefixer` 제거, `@next/eslint-plugin-next` 16.4.6 으로 정렬. `vite` 7.3.8 명시(Vitest 4 지원 범위), `@types/node` 22 (Node 22 와 일치).
- **남은 우회와 제거 조건**
  - `overrides` → **제거 조건**: `@remotion/eslint-plugin` 이 `@typescript-eslint/utils >= 8` 에 의존하거나 피어 범위에 eslint 9 를 포함하는 버전이 나오면 삭제하고 `npm ls` 로 invalid 0 확인.
  - npm 11 고정 → **제거 조건**: 사용하는 Node LTS 기본 npm 이 11 이상이 되면 `npm install -g` 단계 삭제.
  - `vite` 7 고정 → **제거 조건**: npm 11 기준 `vite@8` 로 올려 `npm install` 및 `npm ls` 가 깨끗하면 해제.

## DR-007 공식 Agent Skills / Remotion 플러그인 설치 방식

- **결정**
  - Remotion: **공식 Claude Code 플러그인** `remotion@remotion` 을 project scope 로 설치 (`.claude/settings.json` 의 `extraKnownMarketplaces` + `enabledPlugins` 커밋). `remotion-dev/skills` 와 v4.0.547 기준 **스킬 구성이 동일**(diff 로 확인, 플러그인은 다른 에이전트용 메타 파일만 제외)하므로 skills CLI 로는 설치하지 않는다(중복 방지).
  - 나머지: `skills` CLI 1.9.0 으로 `.claude/skills/` 에 복사 설치, `skills-lock.json` 으로 원본 커밋 고정. 설치: trigger-setup/tasks/realtime/cost-savings, supabase, supabase-postgres-best-practices, vercel-react-best-practices, vercel-composition-patterns, deploy-to-vercel, webapp-testing.
  - `claude-api`, `skill-creator` 는 Claude Code 기본 제공 skill 과 동일하여 설치하지 않음(설치 후 중복 확인되어 제거).
- **검증**: 세션의 사용 가능 skill 목록에 위 skill 이 표시됨, `claude plugin list` → `remotion@remotion  Scope: project  Status: enabled`.
- **스크립트 수정 사항**: 원래 스크립트는 `--agent`/`--yes` 가 없어 비대화형 환경에서 멈출 수 있었고, Vercel skill 이름이 실제(`vercel-react-best-practices`, `vercel-composition-patterns`)와 달랐으며, Remotion 을 플러그인과 중복 설치했다 → 수정.
- **재검토**: Trigger.dev SDK 설치(M2) 후 SDK 동봉 skill 버전과 lock 의 커밋이 맞는지 확인.

## DR-008 원자적 상태 전이 + Outbox(jobs) 디스패치

- **결정**
  - 상태 전이 판단은 `src/domain/pipeline.ts`(순수 TS)가, 반영은 Postgres 함수 `apply_transition()` 이 **한 트랜잭션**으로: 행 잠금(`FOR UPDATE`) → status·revision 낙관적 검사 → 상태 변경 → op 목록(대본 교체, 승인 기록/취소, 장면 stale, 렌더 무효화, 예약 취소, 작업 enqueue, 작업 완료/실패) → 감사 로그.
  - `jobs` 테이블이 Outbox. 외부 실행기(Trigger.dev)는 **커밋 후** 호출하며, 전달 실패 시 `list_dispatchable_jobs()` 스윕이 재전달한다. Trigger.dev 측에는 `jobs.idempotency_key` 를 global idempotency key 로 넘겨 중복 실행을 이중 차단(M2).
  - 실행은 `claim_job()` lease(`SKIP LOCKED`, 만료 시 회수)로 1회만. 완료 시 `project_revision` 이 바뀌었으면 결과를 버리고 작업을 `canceled`.
  - M1 디스패치 모드: `inline`(Next `after()` 로 응답 후 실행, 개발·개인용), `none`(기록만), `trigger`(M2).
- **대안 검토**: Supabase Queues(pgmq)·pg_net 기반 큐 — Trigger.dev 가 이미 재시도·지연·관측을 제공하므로 중복 인프라가 됨. 별도 outbox 테이블 — `jobs` 가 이미 작업 단위 상태를 가지므로 통합.

## DR-009 DB 보안 모델

- **결정**: `authenticated` 는 자기 소유 행 **SELECT 만**(RLS + 테이블 GRANT), `anon` 은 접근 없음. 모든 쓰기는 서버가 사용자 검증(`getClaims()`) 후 `service_role` 로 RPC 호출. RPC 는 `SECURITY INVOKER`, `search_path=''`, EXECUTE 는 `service_role` 에만. `instagram_accounts.access_token_secret_id` 는 컬럼 GRANT 에서 제외.
- **근거**: Supabase 2026-04-28 Breaking Change — 새 테이블은 Data API 에 자동 노출되지 않음(명시적 GRANT 필요). 로컬도 `auto_expose_new_tables: false` 로 클라우드 기본값과 일치시킴. supabase skill 보안 체크리스트(SECURITY DEFINER 회피, `(select auth.uid())`, UPDATE 시 WITH CHECK).
- **검증**: `supabase db advisors --fail-on warn` 0건, `supabase db lint --fail-on warning` 0건, RLS 통합 테스트(타 사용자 0행, anon 42501, 직접 쓰기 42501, RPC 호출 42501, 토큰 컬럼 42501).

## DR-010 로컬 Supabase: CLI v3, Docker Hub 이미지

- **결정**: Supabase CLI `supabase@3.4.0` 을 devDependency 로 고정. v3 는 **로컬이 기본 대상**이고 원격 변경은 `--remote --yes` 필요(2026-11-04 Breaking Change) → 실수로 운영 DB 를 건드릴 위험 감소. 설정 파일은 `supabase/config.jsonc`.
- 이 클라우드 개발 환경은 ECR CDN(`*.cloudfront.net`)이 차단되어 `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` 로 이미지를 받는다. GitHub Actions 는 기본 레지스트리 사용.
- 사용하지 않는 컨테이너는 제외하고 시작(`npm run db:start`): studio, imgproxy, edge-runtime, logflare, vector, supavisor, mailpit, realtime, postgres-meta.

## DR-011 백그라운드 작업 Trigger.dev 이전 방식

- **상태**: 채택 (2026-11-25, M2). 코드·설정 완료, **Trigger.dev 클라우드 연결은 사용자 계정 필요**.
- **결정**
  - Trigger.dev 태스크는 얇은 래퍼: `pipeline-job`(small-1x), `render-job`(large-1x), `sweep-outbox`(1분 cron). 실행·재시도·상태 전이 로직은 모두 `runJob()` 에 있다 → 같은 코드가 inline 모드와 Trigger.dev 에서 동작.
  - 태스크 자체 재시도는 끔(`maxAttempts: 1`). 재시도는 DB(`jobs.attempt`, `run_after`)가 관리하고 스윕이 다시 전달한다 → 재시도 정책이 한 곳에만 있다.
  - 디스패처: `TriggerDispatcher` 가 `tasks.trigger<typeof task>(id, { jobId })` 를 **타입 전용 import** 로 호출, 멱등 키는 `idempotencyKeys.create(\`job:{id}:a{attempt}:d{dispatch}\`, { scope: "global" })` (trigger-tasks skill: v4.3.1+ 문자열 키 기본 scope 는 run).
  - 모드 선택: `JOB_DISPATCH_MODE` 미설정 시 `TRIGGER_SECRET_KEY` 가 있으면 `trigger`, 없으면 `inline`(로컬 개발·E2E). inline 은 응답 후 `after()` 로 실행하고, 재시도는 프로세스 내 타이머 + 요청 시 스윕으로 회수.
  - 빌드: `additionalFiles(.remotion-bundle/**)`, `aptGet`(Remotion Linux 의존성 목록), `external: @remotion/renderer`, Next 의 `server-only` 가드는 `esbuildPlugin` 으로 빈 모듈 대체.
- **검증**: 태스크 파일을 같은 esbuild 설정으로 번들 → Node 에서 로드 → 태스크 3개 등록 확인. TriggerDispatcher 단위 테스트(SDK mock). `trigger.dev deploy --dry-run` 은 로그인이 필요해 미실행.
- **남은 사용자 작업**: Trigger.dev 로그인·프로젝트 생성(사람의 인증 필요, trigger-setup skill) → `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY` 설정 → `npm run trigger:dev` 또는 `trigger:deploy`. Trigger.dev 실행 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PROVIDER_MODE`, `PUBLISH_MODE`.
- **비용 메모**: Trigger.dev 는 실행 시간 과금(무료 크레딧 포함). 렌더는 large-1x 로 15초 영상 기준 로컬 측정 수십 초 — 클라우드 첫 실행 후 실측해 DR-005 에 기록.

## DR-012 장면 단위 작업 키·결과 반영·재사용 (DR-008 보완)

- **문제**: M1 의 장면 작업 멱등 키(입력 해시)는 같은 프롬프트로 "다시 생성" 하면 이미 성공한 작업과 충돌해 작업이 만들어지지 않아 `SCENES_GENERATING` 에서 멈출 수 있었다.
- **결정**
  - 장면·나레이션 작업 키 = `{kind}:{sceneId}:r{전이 revision}` → 같은 전이의 중복 enqueue(더블 클릭)는 막고, 새 재생성 요청은 새 작업. 입력 해시(`jobInputKey`)는 `payload.inputKey` 와 결과(`*_input_hash`, `assets.input_key`)에 기록.
  - **비용 중복 방지는 대상 선택으로**: ready 인 장면은 enqueue 하지 않는다. 대상 = 명시한 장면 + ready 가 아닌 장면(pending·stale·failed).
  - 생성 단계로 들어가는데 대상이 0개면(예: 영상 입력이 바뀌지 않은 재승인) 도메인 상태 머신으로 `*_SUCCEEDED` 까지 한 번에 전이해 다음 검수로 이동.
  - 장면 결과 반영 `complete_scene_part()`: 작업 완료 + 장면 결과 + (해당 파트 장면이 모두 끝났으면) 프로젝트 전이를 한 트랜잭션에서. 목표 상태는 호출자가 `transition()` 으로 계산해 전달.
  - 특정 장면 수정·재생성: 장면 검수 중이면 `REGENERATE_SCENES`, 수정이 있거나 장면 승인 이후 단계면 `EDIT_SCENE`(장면·최종 승인 초기화, 렌더 무효·예약 취소) → `REGENERATE_SCENES`. 나레이션은 `REGENERATE_NARRATION` + 문구 수정 op (최종 승인만 초기화).

## DR-013 렌더: Remotion 사전 번들 + Node SSR

- **결정**: `npm run remotion:bundle` 로 `.remotion-bundle` 을 만들고(빌드 스크립트에 포함), 렌더는 `@remotion/renderer` 의 `selectComposition` + `renderMedia`(h264, aac 128k, yuv420p, enforceAudioTrack). 요청마다 webpack 번들을 하지 않는다 (remotion-saas/remotion-render skill). Player 미리보기와 렌더는 같은 `ReelComposition` + 같은 `resolveCompositionPlan()` 결과를 쓴다.
- 최종 승인 시 컴포지션 계획(asset id 기준)과 해시를 `renders` 에 고정 → 렌더는 승인한 내용 그대로. 서명 URL 은 렌더 시점에 2시간짜리로 발급.
- **검증**: 실제 렌더 테스트에서 MP4 박스 순서 `ftyp → moov → mdat`(faststart), `avc1`·`mp4a` 트랙 확인 (Instagram 규격 DR-003).
- 이 클라우드 개발 환경은 Node 가 프록시를 직접 쓰지 않아 Remotion 의 Chromium 다운로드 시 `NODE_USE_ENV_PROXY=1` 이 필요하다 (GitHub Actions·일반 환경은 불필요).

## DR-014 진행 상태 표시: DB 폴링 (Realtime 보류)

- **결정**: 스튜디오는 `GET /api/projects/:id` 를 생성·렌더 중 1.5초, 검수 중 10초 간격으로 폴링하고 탭 복귀 시 갱신한다. 상태의 진실 공급원이 DB 이므로 새로고침·브라우저 종료 후에도 그대로 복원된다. 선택한 장면은 URL(`?scene=`), 저장 전 대본 초안은 localStorage(같은 revision 일 때만 복원).
- **이유**: 개인용 MVP 에서 동시 사용자가 적고, Realtime 은 로컬 스택 추가 컨테이너·RLS 구독 설정이 필요해 이득 대비 복잡도가 크다. 폴링 응답의 서명 URL 이 바뀌어도 Player 가 다시 로드되지 않도록 최종 해시가 같으면 이전 미리보기 props 를 재사용.
- **재검토 조건**: 다중 사용자·협업 편집, 또는 폴링 부하가 문제가 될 때 Supabase Realtime(`projects`, `scenes`, `jobs` 는 이미 publication 에 포함) 으로 전환.

## DR-015 개발(local) / 클라우드(cloud) 환경 분리와 무료 플랜 조건

- **결정**: `APP_ENV` 로 분리한다 (미설정 시 Vercel 이면 cloud). cloud 는 Trigger.dev 연결(`TRIGGER_SECRET_KEY`)이 **필수**이며 없으면 API 가 503 `SERVICE_MISCONFIGURED` 로 실패한다 — inline 실행으로 조용히 바뀌지 않는다 (`src/server/env.ts`). 로컬 Supabase 주소도 cloud 에서 거부.
- **배치**: Supabase 클라우드(도쿄) · Vercel(`hnd1`, 같은 지역) · Trigger.dev prod. 마이그레이션은 `scripts/remote-migrate.mjs`(Management API, DB 비밀번호 불필요, CLI 와 같은 이력 테이블). 렌더러·번들은 Vercel 함수에서 제외(`outputFileTracingExcludes`)하고 Trigger.dev 워커에서만 실행.
- **비밀 관리**: 비밀 키는 각 대시보드의 Sensitive 변수로만 저장. 저장소·채팅·로그에 남기지 않는다. 클라이언트 번들에는 Supabase URL·publishable key 만 포함됨을 배포 번들 검사로 확인 (docs/07 §6).
- **무료 플랜 조건 (2026-11-25 공식 문서)**: docs/08 §6. 핵심 위험 3가지
  1. **Vercel Hobby 는 개인·비상업 용도만** 허용 → 수익화 운영 전 Pro 전환 필요.
  2. Supabase Free 는 1주 비활성 시 일시 정지, 파일 1GB → 발행 완료 프로젝트의 중간 산출물 정리 정책 필요.
  3. Trigger.dev Free 월 $5 크레딧 → sweep 스케줄을 10분·micro 로 낮춤(월 약 $0.1), 재시도는 delay 트리거.
- **재검토 조건**: 상업적 운영 시작, 저장 용량 70% 도달, Trigger.dev 크레딧 70% 도달 시 유료 플랜 비용을 사용자에게 먼저 보고.

## DR-016 Provider 교체: 카탈로그 + 서비스 설정 + 프로젝트 스냅샷

- **결정**: 대본·장면 시각물·음성 provider 를 **id 로 선택**한다 (`src/providers/catalog.ts`).
  - 카탈로그 항목: `available`(구현됨) / `planned`(조사만 완료, 선택 시 오류). live 항목은 `PROVIDER_MODE=live` 일 때만 허용(설정 + 배포 환경변수 이중 잠금).
  - 선택값 `ProviderSelection` = script, sceneVisual, sceneVideo(혼합용), speech, visualStrategy(`image_motion` | `video` | `hybrid`), monthlyBudgetUsd.
  - 혼합 방식은 훅(첫 장면)과 가장 긴 장면만 영상 provider, 나머지는 이미지+모션 (`videoSceneIndexes`).
  - 예산 가드 `estimateReelCostUsd` → `checkBudget`: 추정 불가(null) 항목이 있거나 월 예산을 넘으면 유료 작업을 시작하지 않는다.
- **DB 단계 (첫 live provider 구현과 함께)**: `user_settings`(사용자별 선택, RLS: 본인 SELECT, 쓰기는 RPC) + `projects.provider_selection jsonb`(생성 시 스냅샷 → 진행 중 프로젝트는 설정 변경 영향 없음, jobInputKey 에 provider 이름 포함) + 설정 화면(카탈로그의 `catalogForClient()` 표시, planned 는 비활성). 선택지가 Mock 뿐인 지금 화면을 만들면 의미 없는 UI 가 되므로 미룬다.
- **이미지+모션**: `SceneVisual.image` 에 Ken Burns(줌·팬) 모션을 `ReelComposition` 에 추가 (Remotion 공식 skill 가이드 기준), 이미지 provider 구현 시 함께.
- **재검토 조건**: 후보 평가(docs/08 §7) 결과 확정 시 해당 항목을 `available` 로 전환.
