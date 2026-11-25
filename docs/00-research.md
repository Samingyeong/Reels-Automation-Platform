# 00. 오픈소스·공식 문서 조사

조사일: 2026-11-25. 각 저장소는 `--depth 1` 로 클론해 LICENSE, README, 소스 구조를 직접 확인했다.

## 1. 요약 결정

| 항목 | 결정 |
| --- | --- |
| 프로젝트 기반 | `remotion-dev/template-next-app-dir-tailwind` (Remotion 공식 Next.js App Router + Tailwind 템플릿) |
| 렌더링 위치 | Trigger.dev 워커에서 `@remotion/bundler` + `@remotion/renderer` (`renderMedia`). 템플릿의 Lambda 코드는 제거 |
| 코드 복사 허용 | MIT 프로젝트(MoneyPrinterTurbo, supabase/agent-skills)의 **아이디어·프롬프트 구조**만 TS 로 재작성. 출처 주석 표기 |
| 코드 복사 금지 | Render Studio (FSL-1.1 — 경쟁 용도 제한). 설계 참고만 |
| Agent Skills | 공식 skill 은 `scripts/install-agent-skills.sh` 로 설치(벤더링하지 않음). 프로젝트 전용 skill 만 `.claude/skills/` 에 커밋 |

## 2. 저장소별 검토

### remotion-dev/template-next-app-dir(-tailwind) — 기반으로 채택
- 구성: Next.js 16 App Router, `@remotion/player` 미리보기, `@remotion/lambda` 렌더 API, zod 스키마, Remotion Studio.
- `template-next-app-dir` README 에 **"discontinued"** 표기가 있음. `remotion-saas` skill(v4.0.547)이 권장하는 Next.js 템플릿은 `template-next-app-dir-tailwind` → 이것을 사용.
- 가져온 것: 디렉터리 구조, `remotion.config.ts`, Tailwind v4 webpack override, ESLint flat config(Remotion 규칙 분리), Player 사용 방식.
- 제거한 것: `src/lambda`, `api/lambda/*`, `deploy.mjs`, `vercel.json`(빌드 시 Lambda 배포), 데모 컴포넌트.
- 라이선스: Remotion 은 **Remotion License**. 개인·3인 이하 회사 무료, 그 이상은 Company License 필요. 렌더 시 `licenseKey` 전달 권장(`remotion-license`, `remotion-render` skill). → **사업화 전 라이선스 확인 필요 (이슈 D-1)**.

### remotion-dev/skills (v4.0.547)
- `remotion-best-practices`, `remotion-captions`(Caption 타입·TikTok 스타일 자막), `remotion-render`, `remotion-saas`(템플릿·렌더 방식 비교), `remotion-license`, `remotion-multimedia` 등.
- 활용: 컴포지션 작성, 자막(`@remotion/captions` 의 `Caption` 타입을 그대로 도메인 계약으로 채택), 렌더 옵션.
- 렌더 방식 비교(remotion-saas/rendering.md): Lambda(가장 빠름, AWS 필요) / Vercel Sandbox / Node.js SSR. 본 프로젝트는 스택 제약(Trigger.dev)에 따라 Node SSR 을 Trigger.dev 머신에서 실행. Lambda 는 대체 경로로 문서화.

### triggerdotdev/skills (SDK 4.8.x 와 동기화된 미러)
- `trigger-setup`, `trigger-tasks`, `trigger-realtime`, `trigger-cost-savings`.
- 활용 포인트
  - `schemaTask` + zod 로 payload 검증, 검증 실패는 재시도 안 함.
  - `retry` 설정, `AbortTaskRunError` 로 재시도 불가 오류 즉시 종료.
  - `idempotencyKeys.create(key, { scope: "global" })` — **v4.3.1+ 에서 문자열 키 기본 scope 가 `run`** 이므로 중복 방지에는 반드시 global scope.
  - 트리거 옵션 `delay` 로 예약 발행, `runs.reschedule`/`runs.cancel` 로 예약 변경·취소.
  - 빌드 확장 `ffmpeg`, `aptGet`, `additionalFiles` (Remotion 번들·Chromium 의존성).
  - CLI·`@trigger.dev/sdk`·`@trigger.dev/build` 버전을 반드시 동일하게 고정.

### supabase/agent-skills (MIT)
- `supabase`(Auth/SSR/RLS/Storage 전반), `supabase-postgres-best-practices`.
- skill 의 핵심 원칙: "Supabase 는 자주 바뀌므로 changelog 와 현재 문서를 먼저 확인" → CLAUDE.md 규칙에 반영.
- 활용: `@supabase/ssr` 쿠키 세션, RLS 에서 `(select auth.uid())` 패턴, 서비스 롤 키 서버 한정.

### vercel-labs/agent-skills
- `react-best-practices`, `composition-patterns`, `web-design-guidelines`, `deploy-to-vercel`, `vercel-optimize`.
- 활용: UI 구현(M2) 시 React/Next 성능 규칙, Vercel 배포.

### anthropics/skills
- `skill-creator`(프로젝트 skill 작성 규칙), `webapp-testing`(Playwright 기반 E2E), `frontend-design`, `claude-api`(LLM provider 구현 시 최신 모델·SDK 사용).
- 각 skill 디렉터리에 개별 LICENSE.txt 존재 → 벤더링하지 않고 설치 스크립트로만 사용.

### Render-Org/render-studio — 참고만 (코드 복사 금지)
- 브라우저 기반 AI 영상 편집기. Next.js + Supabase/Postgres(Drizzle) + **Inngest** + Upstash Redis + Remotion(Lambda) + Modal 서비스.
- **라이선스: Functional Source License 1.1, MIT Future License.** "Competing Use"(동일·유사 기능의 상용 제품 제공)는 허용 목적이 아님. 우리 서비스는 AI 영상 제작 SaaS 로 경쟁 용도에 해당할 수 있으므로 **코드·컴포지션 복사 금지**, 2년 후 MIT 전환분만 재검토.
- 참고할 설계: 타임라인 데이터 모델을 `packages/remotion` 으로 분리해 Player·서버 렌더가 공유하는 구조(우리도 `src/domain/schemas.ts` 의 `ReelCompositionProps` 를 공유), 요소 타입별 컴포넌트(Video/Image/Audio/Text) 분리.
- 도입하지 않는 것: Bun, Drizzle, Inngest, Redis, Modal, Fly.io — 스택 중복.

### harry0703/MoneyPrinterTurbo (MIT) — 파이프라인 아이디어 참고
- Python(FastAPI + Streamlit). 주제 → LLM 대본 → 검색어 생성 → 스톡 영상(Pexels/Pixabay) → TTS(edge-tts/Azure 등) → 자막(TTS word boundary 또는 Whisper) → MoviePy 합성.
- 재사용(재작성) 대상
  1. 대본 생성 시스템 프롬프트의 제약 조건(인사말 금지, 마크다운 금지, 주제 언어로 응답) → `ScriptProvider` 프롬프트에 반영.
  2. 대본에서 장면별 영상 검색어를 생성하는 단계 → `visualPrompt` 필드. 스톡 영상 provider(Pexels) 를 저비용 `SceneVideoProvider` 구현 후보로.
  3. 자막 보정(`subtitle.correct`): STT 결과를 원문 대본과 정렬해 오탈자를 바로잡는 아이디어 → `CaptionProvider` 에서 "원문 텍스트 + 타이밍" 정렬로 단순화.
  4. 소셜 메타데이터(캡션·해시태그) 생성 → `Script.caption`, `hashtags`.
- 도입하지 않는 것: Python 서버, MoviePy 합성(Remotion 이 대체), 다수의 비공식 provider.

## 3. Instagram 공식 API (Graph API Content Publishing)

> ⚠️ 이 세션의 네트워크 정책상 `developers.facebook.com` 에 접근할 수 없어 아래는 기존에 알려진 공식 스펙 기준이다. **M4 착수 전 공식 문서로 재검증한다 (이슈 D-2).**

- 계정: Instagram 비즈니스 또는 크리에이터 계정. 두 가지 로그인 경로
  - Instagram Login: `graph.instagram.com`, 권한 `instagram_business_basic`, `instagram_business_content_publish`, (성과) `instagram_business_manage_insights`
  - Facebook Login: `graph.facebook.com`, 권한 `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` 등
  - MVP 는 Facebook 페이지 연결이 필요 없는 **Instagram Login** 을 우선.
- 발행 절차
  1. `POST /{ig-user-id}/media` — `media_type=REELS`, `video_url`(공개 접근 가능한 URL), `caption`, `share_to_feed`, 선택 `cover_url`/`thumb_offset` → 컨테이너 id
  2. `GET /{container-id}?fields=status_code` 폴링 — `IN_PROGRESS` / `FINISHED` / `ERROR` / `EXPIRED` / `PUBLISHED`
  3. `POST /{ig-user-id}/media_publish` — `creation_id={container-id}` → 미디어 id
  4. `GET /{media-id}?fields=permalink`
- 제한: 계정당 24시간 내 API 게시 수 제한(문서상 100건)이 있으며 `GET /{ig-user-id}/content_publishing_limit` 로 확인. 컨테이너는 생성 후 일정 시간(24시간) 내 게시하지 않으면 만료.
- **API 자체 예약 게시 기능이 없다** → 예약은 Trigger.dev `delay` 로 우리 쪽에서 구현.
- Reels 영상 권장: MP4/MOV, H.264 + AAC, 9:16, 1080×1920, 23–60fps. 우리 렌더 기본값 1080×1920, 30fps, h264/aac.
- 성과: `GET /{media-id}/insights?metric=...` — Reels 는 `views`, `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions` 등. `plays`·`impressions` 계열은 단계적으로 폐지됨 → 지표 목록은 설정값으로 두고, 응답에 없는 지표는 저장하지 않는다.
- `video_url` 은 Supabase Storage **signed URL**(충분한 만료 시간, 예: 2시간)로 전달한다. 버킷은 비공개 유지.

## 4. 기타 외부 API 후보 (provider 구현 후보, M3)

| 역할 | 1차 후보 | 비고 |
| --- | --- | --- |
| 대본(LLM) | Anthropic Claude API | `claude-api` skill 로 최신 모델 ID 확인 후 구현. 구조화 출력(JSON) → `Script` zod 검증 |
| 장면 영상 | Pexels 스톡 영상 검색(저비용) / AI 영상 생성 API(Veo, Runway 등) | 비동기 작업형 → `start`/`poll` 인터페이스 |
| TTS | ElevenLabs(문자 타이밍 제공) / OpenAI TTS | 타이밍 제공 시 CaptionProvider 생략 |
| 자막 정렬 | TTS 타이밍 → 없으면 Whisper 계열 STT + 원문 정렬 | |

모든 후보는 **비용·약관·출력물 상업적 이용 가능 여부**를 provider 추가 시 `docs/05-providers.md` 에 기록한다.
