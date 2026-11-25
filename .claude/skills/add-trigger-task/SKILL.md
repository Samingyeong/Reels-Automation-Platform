---
name: add-trigger-task
description: Trigger.dev 백그라운드 태스크(대본·장면·나레이션 생성, 렌더, 발행, 성과 수집, 스윕)를 추가·수정할 때 사용. 멱등성, 재시도, DB 기록, 상태 이벤트 보고 규칙. 공식 trigger-tasks skill 과 함께 로드한다.
---

# Trigger.dev 태스크 작성

먼저 공식 `trigger-tasks` skill 을 로드한다 (SDK 버전에 맞는 API).

## 템플릿 규칙

```ts
// src/trigger/<task-id>.ts
export const generateX = schemaTask({
  id: "generate-x",
  schema: z.object({ projectId: z.string().uuid(), jobId: z.string().uuid() }),
  retry: { maxAttempts: 3 },
  run: async (payload, { ctx }) => { /* ... */ },
});
```

1. **입력은 ID 만.** 콘텐츠는 실행 시 DB 에서 읽는다 (payload 에 대본·URL 금지 → 오래된 데이터 처리 방지).
2. **시작 시 검증.** job 이 `queued|running` 이고 프로젝트 상태가 기대 상태가 아니면 조용히 종료(취소·대체된 작업).
3. **재사용 먼저.** `jobInputKey` 와 같은 `assets.input_key` 가 있으면 외부 호출 없이 연결.
4. **외부 비동기 작업** 은 `external_job_id` 를 즉시 저장하고 `wait.for` 로 폴링. 재시도 시 저장된 id 로 재개.
5. **결과 저장 → 이벤트 보고** 순서. Storage 업로드·`assets` insert 가 성공한 뒤에만 `*_SUCCEEDED` 를 `project-service.dispatch` 로 보고.
6. **실패.** `ProviderError.retryable=false` → `AbortTaskRunError`. 최종 실패는 `catchError`/마지막 attempt 에서 job `failed` + `*_FAILED` 이벤트 (에러 메시지 저장, 키 등 비밀값 제거).
7. **트리거 측**: `idempotencyKeys.create(key, { scope: "global" })` 필수 (v4.3.1+ 기본 scope 는 run).
8. 발행 태스크는 `docs/01-architecture.md` 4.4 의 단계별 저장 순서를 그대로 따른다. 재시도 1회, 자동 재게시 금지.
9. 테스트: run 함수 로직을 순수 함수로 분리해 Vitest 로 검증 (같은 키 2회 실행 → 외부 호출 1회).
10. `npm run ci`, 로컬은 `npx trigger.dev dev`.
