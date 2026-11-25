---
name: db-migration
description: Supabase 스키마(테이블, enum, 인덱스, RLS, RPC, Storage 정책) 변경 시 사용. 마이그레이션 파일 작성, RLS 검증, 타입 재생성, 도메인 상수 동기화 절차. 공식 supabase / supabase-postgres-best-practices skill 과 함께 로드한다.
---

# DB 마이그레이션

## 절차

1. `docs/02-db-schema.md` 확인. 마이그레이션은 한 번에 한 명만 작성 (소유권: 리드/DB 담당).
2. 새 파일: `supabase/migrations/$(date -u +%Y%m%d%H%M%S)_<설명>.sql`. **적용된 파일은 수정 금지.**
3. 규칙
   - 새 테이블은 즉시 `enable row level security` + 소유자 SELECT 정책. 쓰기 정책은 만들지 않는다(서버 service_role 경유).
   - RLS 에서 `auth.uid()` 는 `(select auth.uid())` 로 감싼다.
   - 중복 방지가 필요한 곳은 부분 유니크 인덱스 (`where status in (...)`).
   - `security definer` 함수는 `set search_path = public` + `anon/authenticated` 실행 권한 회수.
   - enum 값 변경 시 `src/domain/pipeline.ts` 상수와 테스트를 같은 PR 에서 변경.
4. 검증: `supabase db reset` → 통합 테스트(다른 사용자 토큰으로 조회 시 0행) → `supabase db lint`.
5. 타입 재생성: `supabase gen types typescript --local > src/server/database.types.ts`.
6. `docs/02-db-schema.md` 갱신.
