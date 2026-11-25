# 04. API 명세

Next.js Route Handlers (`src/app/api/**/route.ts`). 모든 요청은 Supabase Auth 쿠키 세션 필요.

## 공통 규약

- 요청·응답 JSON, 요청 본문은 zod 로 검증 (`400 VALIDATION_ERROR`).
- 상태를 바꾸는 요청은 `revision`(낙관적 잠금)을 받는다. 불일치 → `409 REVISION_CONFLICT`.
- 승인 요청은 `contentHash` 를 받는다. 서버 계산값과 다르면 → `409 CONTENT_CHANGED`.
- 허용되지 않는 전이 → `409 INVALID_TRANSITION` (`reason` 포함).
- 타인 리소스 → `404` (존재 여부 노출 안 함).
- 생성 요청 한도 초과 → `429 QUOTA_EXCEEDED`.
- 비동기 작업을 시작하는 요청은 `202 Accepted` + 갱신된 프로젝트 요약. 결과는 Realtime 또는 GET 으로 확인.

```ts
type ErrorBody = { error: { code: string; message: string; details?: unknown } };
type ProjectSummary = { id: string; status: ProjectStatus; revision: number; updatedAt: string };
```

## 프로젝트

| Method | Path | Body | 응답 | 전이 |
| --- | --- | --- | --- | --- |
| GET | `/api/projects` | – | `ProjectSummary[]` (+ title, 썸네일) | – |
| POST | `/api/projects` | `ScriptInput` | `201 ProjectSummary` | → DRAFT |
| GET | `/api/projects/:id` | – | `ProjectDetail` (scenes, approvals 유효여부, jobs 최근, currentRender, publications, contentHashes) | – |
| DELETE | `/api/projects/:id` | – | `204` | 진행 중 작업 있으면 409 |

`ProjectDetail.contentHashes = { script, scenes, final }` — 화면이 승인 요청 시 그대로 돌려보낸다.

## 1. 대본

| Method | Path | Body | 응답 | 이벤트 |
| --- | --- | --- | --- | --- |
| POST | `/api/projects/:id/script/generate` | `{ revision }` | 202 | GENERATE_SCRIPT |
| PUT | `/api/projects/:id/script` | `{ revision, script: Script }` (장면 id 유지 시 `scenes[].id` 포함) | 200 | EDIT_SCRIPT |
| POST | `/api/projects/:id/script/approve` | `{ revision, contentHash }` | 202 | APPROVE_SCRIPT |

## 2. 장면 영상

| Method | Path | Body | 응답 | 이벤트 |
| --- | --- | --- | --- | --- |
| PATCH | `/api/projects/:id/scenes/:sceneId` | `{ revision, visualPrompt?, durationSec? }` | 200 | EDIT_SCENE |
| POST | `/api/projects/:id/scenes/regenerate` | `{ revision, sceneIds: string[] }` | 202 | REGENERATE_SCENES |
| POST | `/api/projects/:id/scenes/approve` | `{ revision, contentHash }` | 202 | APPROVE_SCENES |

## 3. 나레이션·자막·최종 미리보기

| Method | Path | Body | 응답 | 이벤트 |
| --- | --- | --- | --- | --- |
| POST | `/api/projects/:id/narration/regenerate` | `{ revision, sceneIds: string[], voiceId? }` | 202 | REGENERATE_NARRATION |
| PUT | `/api/projects/:id/captions` | `{ revision, scenes: { id, captions: Caption[] }[] }` | 200 | EDIT_CAPTIONS |
| GET | `/api/projects/:id/preview-props` | – | `ReelCompositionProps` (signed URL 포함, 만료 1h) | – |
| POST | `/api/projects/:id/final/approve` | `{ revision, contentHash }` | 202 | APPROVE_FINAL |

## 4. 렌더 · 재시도

| Method | Path | Body | 응답 | 이벤트 |
| --- | --- | --- | --- | --- |
| POST | `/api/projects/:id/retry` | `{ revision }` | 202 | RETRY (현재 *_FAILED 단계) |
| GET | `/api/projects/:id/render` | – | `{ status, videoUrl?(signed), sizeBytes?, durationMs? }` | – |

사용자가 MP4 를 다운로드·업로드하는 흐름은 제공하지 않는다. 미리보기용 signed URL 만 노출.

## 5. 예약 · 발행

| Method | Path | Body | 응답 | 이벤트 |
| --- | --- | --- | --- | --- |
| POST | `/api/projects/:id/publications` | `{ revision, instagramAccountId, scheduledAt(ISO, ≥ now+2분), caption, shareToFeed }` | 201 | SCHEDULE |
| PATCH | `/api/publications/:id` | `{ scheduledAt?, caption? }` (status=scheduled 일 때만) | 200 | – (`runs.reschedule`) |
| DELETE | `/api/publications/:id` | – | 200 | CANCEL_SCHEDULE |
| GET | `/api/publications/:id` | – | `Publication` (+ isLive, permalink, error) | – |
| GET | `/api/publications/:id/insights` | – | `{ fetchedAt, metrics }[]` | – |

`PUBLISH_MODE=mock` 이면 응답의 `isLive: false` 이며 UI 는 "테스트 발행(실제 게시 안 됨)" 으로 표시한다.

## 6. Instagram 계정 연결

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/instagram/connect` | OAuth 시작 (state 쿠키, PKCE 불가 시 state 검증) |
| GET | `/api/instagram/callback` | 코드 교환 → 장기 토큰 → Vault 저장 → `instagram_accounts` upsert |
| GET | `/api/instagram/accounts` | 연결 계정 목록 (토큰 제외) |
| DELETE | `/api/instagram/accounts/:id` | 연결 해제 (예약된 발행이 있으면 409) |

## 7. 워커 → 서버

워커는 HTTP 로 서버를 부르지 않고 **직접 DB 에 기록**한다 (`src/server/project-service.ts` 의 동일 함수 사용, service_role). 따라서 외부에 노출된 웹훅 엔드포인트가 없다.

## 8. Trigger.dev 태스크 계약

| Task id | Payload | 멱등 키 | 재시도 | 머신 |
| --- | --- | --- | --- | --- |
| `generate-script` | `{ projectId, jobId }` | `script:{provider}:{hash(input)}` + projectId | 3 | small-1x |
| `generate-scene-video` | `{ projectId, sceneId, jobId }` | `scene_video:{provider}:{hash}` | 3 (외부 폴링은 `wait.for`) | small-1x |
| `generate-narration` | `{ projectId, sceneIds?, jobId }` | 장면별 `narration:{provider}:{hash}` | 3 | small-1x |
| `render-reel` | `{ projectId, renderId }` | `render:{renderId}` | 2 | large-1x 이상 |
| `publish-reel` | `{ publicationId }` | `publish:{publicationId}` (global) | 1 (내부 단계별 재개) | micro |
| `collect-insights` | `{ publicationId, checkpoint }` | `insights:{publicationId}:{checkpoint}` | 3 | micro |
| `requeue-stuck-jobs` | cron 5분 | – | – | micro |
