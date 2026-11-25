---
name: pipeline-change
description: 프로젝트 제작 파이프라인의 상태·이벤트·승인·초기화 규칙을 추가하거나 바꿀 때 사용. 새 편집 기능(대본/장면/자막/나레이션 수정), 새 승인 게이트, 새 실패/재시도 경로, 상태 enum 변경 시 반드시 로드한다.
---

# 파이프라인 상태 머신 변경

공통 계약 변경이다. `docs/06-work-plan.md` 의 계약 변경 절차를 따른다.

## 체크리스트

1. `docs/03-state-machine.md` 를 먼저 읽고, 변경 후 다이어그램과 표를 갱신한다.
2. `src/domain/pipeline.ts`
   - 상태 추가 → `PROJECT_STATUSES` + DB enum(`project_status`) 마이그레이션 (`db-migration` skill)
   - 이벤트 추가 → `PipelineEvent` 유니온 + `transition()` 의 `case` (TS 가 누락을 잡는다)
   - 워커만 보내는 이벤트면 `WORKER_ONLY_EVENTS` 에 추가
   - 편집 이벤트면 반드시 `REVOKE_APPROVALS(invalidatedApprovals(stage))` + `downstreamOutputEffects(from)` 포함
   - 다음 제작 단계를 시작하는 전이는 오직 `APPROVE_*`/`RETRY`/`REGENERATE_*` 에서만 `ENQUEUE`
3. `src/domain/pipeline.test.ts` 에 추가
   - 허용 상태에서 성공, **그 외 모든 상태에서 거부** (`PROJECT_STATUSES` 전수 루프)
   - 부수효과 정확히 검증 (`toContainEqual`)
   - 진행 중 상태(`*_GENERATING`, `RENDERING`, `PUBLISHING`)·`PUBLISHED` 에서 거부
4. 서버(`src/server/project-service.ts`)가 새 SideEffect 타입을 처리하는지 확인. 처리 안 된 효과가 있으면 컴파일 에러가 나도록 `switch` + `never` 체크 유지.
5. UI 에 새 상태의 표시 문구·가능 액션 추가.
6. `npm run ci`.

## 금지
- `status` 직접 UPDATE, UI 에서 성공 상태 낙관적 표시
- 발행 실패를 자동 재시도로 바꾸기 (중복 게시 위험) — 바꾸려면 리드 승인
