# 02. DB 스키마

원본: [`supabase/migrations/20261125000000_init.sql`](../supabase/migrations/20261125000000_init.sql). 이 문서는 의도와 불변식을 설명한다.

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

## 4. 동시성·트랜잭션

- 상태 전이: `transition_project(id, expected_status, expected_revision, to, actor, event, payload)` → 반환 null 이면 409.
- M1 에서 전이 + 승인 기록/취소 + job 생성 + 장면 stale 처리 를 한 번에 수행하는 `apply_transition(...)` RPC 로 확장한다 (부수효과를 JSON 으로 전달). 외부 호출(Trigger.dev)은 커밋 이후.
- `jobs` 가 outbox 역할: `queued` 인데 `trigger_run_id` 가 없거나 오래된 job 은 스윕 태스크가 재트리거.

## 5. RLS

- `authenticated`: 자기 소유 데이터 **SELECT 만**. Realtime 구독도 이 정책을 따른다.
- 쓰기: 서버(Route Handler)가 사용자 검증 후 service_role 로 수행. 워커도 service_role.
- `transition_project` 는 `anon`, `authenticated` 실행 권한 회수.
- Storage `media`: 비공개 버킷, 첫 폴더가 `auth.uid()` 인 객체만 읽기.

## 6. 마이그레이션 규칙

- 파일명 `YYYYMMDDHHMMSS_<설명>.sql`, 적용된 마이그레이션은 수정하지 않고 새 파일로.
- enum 값 추가 시 `src/domain/pipeline.ts` 의 상수와 함께 변경하고 테스트 추가 (`.claude/skills/db-migration`).
- 로컬: `supabase start` → `supabase db reset` 로 검증. 타입: `supabase gen types typescript --local > src/server/database.types.ts`.
