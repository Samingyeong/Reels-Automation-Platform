---
name: db-migration
description: Supabase 스키마(테이블, enum, 인덱스, RLS, RPC, Storage 정책) 변경 시 사용. 마이그레이션 파일 작성, RLS 검증, 타입 재생성, 도메인 상수 동기화 절차. 공식 supabase / supabase-postgres-best-practices skill 과 함께 로드한다.
---

# DB 마이그레이션

## 절차

1. `docs/02-db-schema.md` 확인. 마이그레이션은 한 번에 한 명만 작성 (소유권: 리드/DB 담당).
2. 새 파일: `npx supabase migration new <설명>` (파일명을 직접 만들지 않는다). **커밋된 마이그레이션은 수정 금지.**
3. 규칙
   - 새 테이블은 즉시 `enable row level security` + 소유자 SELECT 정책 + **명시적 GRANT** (`grant select ... to authenticated`, `grant select, insert, update, delete ... to service_role`). 로컬은 `auto_expose_new_tables: false` 라 GRANT 가 없으면 Data API 에서 42501. 쓰기 정책은 만들지 않는다(서버 service_role RPC 경유).
   - 함수는 `security invoker`, `set search_path = ''`, 객체는 스키마로 완전 수식, `revoke all ... from public, anon, authenticated` 후 `grant execute ... to service_role`.
   - RLS 에서 `auth.uid()` 는 `(select auth.uid())` 로 감싼다.
   - 중복 방지가 필요한 곳은 부분 유니크 인덱스 (`where status in (...)`).
   - `security definer` 는 사용하지 않는다. 불가피하면 Data API 에 노출되지 않는 스키마에 두고 함수 본문에서 `auth.uid()` 소유권을 검사한다 (supabase skill 보안 체크리스트).
   - enum 값 변경 시 `src/domain/pipeline.ts` 상수와 테스트를 같은 PR 에서 변경.
4. 검증: `npm run db:reset` → `npx supabase db lint --fail-on warning` → `npx supabase db advisors --fail-on warn` → `npm run test:integration` (RLS 테스트: 다른 사용자 0행, anon 42501).
5. 타입 재생성: `npm run db:types` (CI 가 최신 여부를 diff 로 검사한다).
6. `docs/02-db-schema.md` 갱신.
