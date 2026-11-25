# 02. DB 스키마

원본: [`supabase/migrations/`](../supabase/migrations/) — `20261125000000_init.sql`(M0), `20261125022527_m1_transitions_outbox_versions.sql`(M1). 이 문서는 의도와 불변식을 설명한다.

## 1. ERD

```
auth.users 1─┬─< instagram_accounts
             ├─< projects 1─┬─< scenes >─┐ (visual_asset_id, narration_asset_id)
             │              ├─< approvals│
             │              ├─< jobs     │
             │              ├─< renders ─┼─> assets
             │              ├─< publications ─< media_insights
             │              └─< project_events
             └─< assets <───────────────┘
```

## 2. 테이블

| 테이블 | 역할 | 핵심 컬럼 / 불변식 |
| --- | --- | --- |
| `projects` | 숏폼 1개 | `status`(파이프라인 상태), `revision`(낙관적 잠금, 전이마다 +1), `options`(ScriptInput) |
| `scenes` | 장면 | `position`, `narration`, `visual_prompt`, `duration_sec`; 영상/나레이션 각각 `*_status`, `*_input_hash`, `*_asset_id` |
| `assets` | Storage 객체 메타 | `storage_path = {user_id}/{project_id}/{kind}/{uuid}.{ext}`, `input_key` 로 동일 입력 재사용 |
| `approvals` | 승인 기록 | 단계별 활성 승인 1개(부분 유니크). `content_hash` 불일치 = 무효. 취소는 `revoked_at` (삭제 안 함) |
| `jobs` | 워커 작업 | `idempotency_key` 부분 유니크(queued/running/succeeded) → 같은 입력 중복 실행 불가. `external_job_id` 로 폴링 재개 |
| `renders` | 렌더 결과 | `composition_hash` = final 승인 해시, `input_props` 스냅샷, 프로젝트당 `is_current` 1개 |
| `publications` | 발행 | 렌더당 활성 발행 1개(부분 유니크). `ig_container_id`/`ig_media_id` 단계별 즉시 저장. `is_live=false` 는 Mock |
| `media_insights` | 성과 스냅샷 | append-only. 응답에 없는 지표는 저장하지 않음 |
| `project_events` | 감사 로그 | 모든 상태 전이 기록 (actor, event, from, to) |
| `instagram_accounts` | 연결 계정 | 토큰 원문 저장 금지 → Vault secret id |

## 3. 해시 정의 (승인·재사용 기준)

| 해시 | 입력 | 사용처 |
| --- | --- | --- |
| script hash | `[{narration, visualPrompt, durationSec}] + caption + hashtags` | script 승인 |
| scene visual input | `{prompt, durationSec, width, height}` + provider | `jobInputKey("scene_video", …)` |
| scenes hash | 장면별 `(id, visual_input_hash, visual_asset_id)` 목록 | scenes 승인 |
| narration input | `{text, voiceId, language}` + provider | `jobInputKey("narration", …)` |
| final hash | `ReelCompositionProps` 전체 | final 승인 = `renders.composition_hash` |

해시는 `src/domain/hash.ts` 의 `contentHash`(키 정렬 JSON → SHA-256)만 사용한다.

## 4. 동시성·트랜잭션 (M1 구현, [DR-008](decisions.md#dr-008-원자적-상태-전이--outboxjobs-디스패치))

| RPC | 역할 |
| --- | --- |
| `apply_transition(project, actor_user, actor, event, expected_status, expected_revision, to_status, ops, error)` | 행 잠금 → status·revision 검사(불일치 `REVISION_CONFLICT`) → 소유권 검사(`PROJECT_NOT_FOUND`) → 상태 변경·revision+1 → ops 순서대로 실행 → `project_events` 기록. 전부 한 트랜잭션 |
| `claim_job(job, lease_seconds)` | `queued`(run_after 경과) 또는 lease 만료된 `running` 작업만 `SKIP LOCKED` 로 가져와 attempt+1 |
| `release_job_for_retry(job, error, delay)` | 시도 횟수가 남으면 `queued` + 백오프, 아니면 `exhausted` |
| `cancel_job(job, reason)` | 프로젝트 변경으로 무효가 된 작업 폐기 |
| `mark_job_dispatched(job, run_id)` / `list_dispatchable_jobs(limit)` | Outbox 전달 기록 / 미전달·lease 만료 작업 스윕 |

`apply_transition` op 종류: `replace_script`, `revoke_approvals`, `record_approval`, `mark_scenes_stale`, `invalidate_render`, `cancel_scheduled_publication`(예약 + 대기 중 publish 작업 취소), `enqueue`(멱등 키 충돌 시 무시), `complete_job`, `fail_job`.
TS 쪽 생성: [`src/server/ops.ts`](../src/server/ops.ts) `effectsToOps()`.

### 장면 결과물 보존 규칙 (`replace_script`)
- 장면 id 를 유지한 채 `visual_prompt`/`duration_sec` 가 바뀌면 `visual_status` → 결과물이 있으면 `stale`, 없으면 `pending`. `narration` 이 바뀌면 `narration_status` 동일 규칙.
- 바뀌지 않은 장면은 상태·결과물 유지 → 재승인 후 재생성 대상에서 제외(비용 중복 방지).
- 목록에 없는 장면은 삭제, id 없는 장면은 새로 추가, position 은 목록 순서로 재배치.

### 승인 결과물 버전 관리
- `approvals(version, snapshot)`: 단계별 버전이 1부터 증가, 승인 당시 콘텐츠 전체를 `snapshot` 에 보관. 새 승인은 이전 활성 승인을 `superseded` 로 대체, 수정은 `revoked_reason = 이벤트명` 으로 취소. 행은 삭제하지 않는다.
- 현재 유효 승인 = `revoked_at is null` (단계별 최대 1개, 부분 유니크 인덱스).

### 작업(jobs) 컬럼 (M1 추가)
`payload`, `result`, `project_revision`(enqueue 시점 revision), `max_attempts`, `run_after`(백오프), `locked_until`(lease), `dispatched_at`, `dispatch_attempts`.

## 5. RLS · GRANT ([DR-009](decisions.md#dr-009-db-보안-모델))

- `authenticated`: 자기 소유 데이터 **SELECT 만** (테이블 GRANT + RLS). Realtime 구독도 이 정책을 따른다.
- `anon`: 권한 없음. 새 테이블 자동 노출 없음(`auto_expose_new_tables: false`) → 테이블 추가 시 GRANT 를 마이그레이션에 명시.
- 쓰기: 서버가 `getClaims()` 로 사용자 검증 후 service_role 로 RPC 호출. RPC 는 `SECURITY INVOKER` + `search_path=''`, EXECUTE 는 service_role 만.
- `instagram_accounts.access_token_secret_id` 는 authenticated 컬럼 GRANT 에서 제외.
- Storage `media`: 비공개 버킷, 첫 폴더가 `auth.uid()` 인 객체만 읽기.

## 6. 마이그레이션 규칙

- 파일명 `YYYYMMDDHHMMSS_<설명>.sql`, 적용된 마이그레이션은 수정하지 않고 새 파일로.
- enum 값 추가 시 `src/domain/pipeline.ts` 의 상수와 함께 변경하고 테스트 추가 (`.claude/skills/db-migration`).
- 로컬: `npm run db:start` → `npm run db:reset` → `npx supabase db lint --fail-on warning` → `npx supabase db advisors --fail-on warn` → `npm run db:types`. CI 가 같은 순서로 검증하고 생성 타입이 최신인지 diff 로 확인한다.
- 새 마이그레이션은 `npx supabase migration new <name>` 으로 만든다.
