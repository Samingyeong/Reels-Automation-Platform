-- Reels Automation Platform 초기 스키마
-- 설계 문서: docs/02-db-schema.md
-- 원칙
--  * 모든 테이블 RLS 활성화. authenticated 는 자기 소유 행 SELECT 만 가능.
--  * 쓰기는 서버(Route Handler)·워커(Trigger.dev)가 service_role 로 수행하며, 서버가 소유권을 먼저 검증한다.
--  * 상태 전이는 src/domain/pipeline.ts 를 통과한 뒤 transition_project() 로만 반영한다 (낙관적 잠금).

create extension if not exists pgcrypto;

-- ---------- enum ----------
create type project_status as enum (
  'DRAFT','SCRIPT_GENERATING','SCRIPT_FAILED','SCRIPT_REVIEW',
  'SCENES_GENERATING','SCENES_FAILED','SCENES_REVIEW',
  'NARRATION_GENERATING','NARRATION_FAILED','FINAL_REVIEW',
  'RENDERING','RENDER_FAILED','RENDERED',
  'SCHEDULED','PUBLISHING','PUBLISH_FAILED','PUBLISHED'
);
create type approval_stage as enum ('script','scenes','final');
create type scene_part_status as enum ('pending','generating','ready','failed','stale');
create type job_kind as enum ('script','scene_video','narration','render','publish','insights');
create type job_status as enum ('queued','running','succeeded','failed','canceled');
create type asset_kind as enum ('scene_video','scene_image','narration_audio','render','cover');
create type publication_status as enum ('scheduled','publishing','published','failed','canceled');

-- ---------- 공통 ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Instagram 계정 ----------
create table instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ig_user_id text not null,
  username text not null,
  -- 토큰 원문은 저장하지 않는다. Supabase Vault 의 secret id 만 보관.
  access_token_secret_id uuid not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ig_user_id)
);

-- ---------- 프로젝트 ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  topic text not null,
  options jsonb not null default '{}',          -- ScriptInput 나머지 (tone, targetDurationSec, language, voiceId…)
  status project_status not null default 'DRAFT',
  revision integer not null default 0,           -- 낙관적 잠금: 모든 전이마다 +1
  caption text not null default '',
  hashtags text[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on projects(user_id, updated_at desc);

-- ---------- 장면 ----------
create table scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  position integer not null,
  narration text not null,
  visual_prompt text not null,
  duration_sec numeric(5,2) not null,
  -- 영상
  visual_status scene_part_status not null default 'pending',
  visual_input_hash text,
  visual_asset_id uuid,
  visual_placeholder jsonb,                       -- Mock provider 결과 {color,label}
  -- 나레이션·자막
  narration_status scene_part_status not null default 'pending',
  narration_input_hash text,
  narration_asset_id uuid,
  narration_duration_ms integer,
  captions jsonb not null default '[]',           -- Caption[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position) deferrable initially deferred
);

-- ---------- 자산 (Supabase Storage 객체 메타데이터) ----------
create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  kind asset_kind not null,
  bucket text not null default 'media',
  storage_path text not null,                     -- {user_id}/{project_id}/{kind}/{uuid}.{ext}
  mime_type text not null,
  size_bytes bigint,
  duration_ms integer,
  provider text not null,
  input_key text,                                 -- jobInputKey → 동일 입력 재사용 (비용 중복 방지)
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index assets_input_key_idx on assets(user_id, input_key) where input_key is not null;

alter table scenes
  add constraint scenes_visual_asset_fk foreign key (visual_asset_id) references assets(id) on delete set null,
  add constraint scenes_narration_asset_fk foreign key (narration_asset_id) references assets(id) on delete set null;

-- ---------- 승인 ----------
create table approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage approval_stage not null,
  content_hash text not null,                     -- 승인 당시 콘텐츠 해시. 현재 해시와 다르면 무효.
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text
);
-- 단계별 유효 승인은 1개만
create unique index approvals_active_uniq on approvals(project_id, stage) where revoked_at is null;

-- ---------- 작업 (백그라운드 워커 실행 기록) ----------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scene_id uuid references scenes(id) on delete cascade,
  kind job_kind not null,
  status job_status not null default 'queued',
  idempotency_key text not null,                  -- Trigger.dev idempotencyKey 와 동일
  provider text,
  external_job_id text,                           -- 외부 비동기 API 작업 id (폴링 재개용)
  trigger_run_id text,
  attempt integer not null default 0,
  error text,
  error_retryable boolean,
  cost_estimate_usd numeric(10,4),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 같은 입력으로 진행 중/성공한 작업은 하나만 → 중복 API 비용 방지
create unique index jobs_active_idem_uniq on jobs(idempotency_key) where status in ('queued','running','succeeded');
create index jobs_project_idx on jobs(project_id, created_at desc);

-- ---------- 렌더 ----------
create table renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  composition_hash text not null,                 -- final 승인 content_hash 와 일치해야 함
  input_props jsonb not null,                     -- ReelCompositionProps 스냅샷
  status job_status not null default 'queued',
  asset_id uuid references assets(id) on delete set null,
  is_current boolean not null default true,       -- 수정 시 false (INVALIDATE_RENDER)
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index renders_current_uniq on renders(project_id) where is_current;

-- ---------- 발행 ----------
create table publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  render_id uuid not null references renders(id),
  instagram_account_id uuid not null references instagram_accounts(id),
  caption text not null,
  share_to_feed boolean not null default true,
  scheduled_at timestamptz not null,
  status publication_status not null default 'scheduled',
  is_live boolean not null,                       -- false = Mock publisher. UI 에 명시.
  trigger_run_id text,
  ig_container_id text,                           -- 생성 후 즉시 저장 → 재시도 시 재사용
  ig_media_id text,
  permalink text,
  attempt integer not null default 0,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 같은 렌더 결과물은 동시에 하나의 활성 발행만 (중복 게시 방지)
create unique index publications_active_uniq on publications(render_id)
  where status in ('scheduled','publishing','published');
create index publications_due_idx on publications(scheduled_at) where status = 'scheduled';

-- ---------- 성과 ----------
create table media_insights (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  metrics jsonb not null                          -- ReelInsights. 응답에 없는 지표는 넣지 않는다.
);
create index media_insights_pub_idx on media_insights(publication_id, fetched_at desc);

-- ---------- 감사 로그 ----------
create table project_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  actor text not null,                            -- 'user:{uuid}' | 'worker:{task}'
  event text not null,
  from_status project_status not null,
  to_status project_status not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index project_events_project_idx on project_events(project_id, id desc);

-- ---------- 상태 전이 (낙관적 잠금) ----------
-- 서버/워커는 pipeline.ts 의 transition() 결과를 이 함수로 반영한다.
-- expected_revision 이 다르면 0 행 → 호출자는 409 로 처리.
create or replace function transition_project(
  p_project_id uuid,
  p_expected_status project_status,
  p_expected_revision integer,
  p_to_status project_status,
  p_actor text,
  p_event text,
  p_payload jsonb default '{}'
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_rev integer;
begin
  update projects
     set status = p_to_status, revision = revision + 1,
         last_error = case when p_to_status::text like '%FAILED' then p_payload->>'error' else null end
   where id = p_project_id and status = p_expected_status and revision = p_expected_revision
  returning revision into v_rev;
  if v_rev is null then return null; end if;
  insert into project_events(project_id, actor, event, from_status, to_status, payload)
  values (p_project_id, p_actor, p_event, p_expected_status, p_to_status, p_payload);
  return v_rev;
end $$;
revoke all on function transition_project from public, anon, authenticated;

-- ---------- updated_at 트리거 ----------
create trigger t_instagram_accounts_updated before update on instagram_accounts for each row execute function set_updated_at();
create trigger t_projects_updated before update on projects for each row execute function set_updated_at();
create trigger t_scenes_updated before update on scenes for each row execute function set_updated_at();
create trigger t_jobs_updated before update on jobs for each row execute function set_updated_at();
create trigger t_renders_updated before update on renders for each row execute function set_updated_at();
create trigger t_publications_updated before update on publications for each row execute function set_updated_at();

-- ---------- RLS ----------
alter table instagram_accounts enable row level security;
alter table projects enable row level security;
alter table scenes enable row level security;
alter table assets enable row level security;
alter table approvals enable row level security;
alter table jobs enable row level security;
alter table renders enable row level security;
alter table publications enable row level security;
alter table media_insights enable row level security;
alter table project_events enable row level security;

create policy "own accounts" on instagram_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy "own projects" on projects for select to authenticated using (user_id = (select auth.uid()));
create policy "own assets" on assets for select to authenticated using (user_id = (select auth.uid()));

-- 프로젝트 하위 테이블: 프로젝트 소유자만 조회
create policy "own scenes" on scenes for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "own approvals" on approvals for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "own jobs" on jobs for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "own renders" on renders for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "own publications" on publications for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "own insights" on media_insights for select to authenticated
  using (exists (select 1 from publications pb join projects p on p.id = pb.project_id
                 where pb.id = publication_id and p.user_id = (select auth.uid())));
create policy "own events" on project_events for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = (select auth.uid())));

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('media', 'media', false)
  on conflict (id) do nothing;
create policy "read own media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Realtime (진행 상태 구독) ----------
alter publication supabase_realtime add table projects, scenes, jobs, renders, publications;
