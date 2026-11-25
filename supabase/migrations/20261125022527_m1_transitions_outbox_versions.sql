-- M1: 원자적 상태 전이, Outbox(jobs) 기반 작업 디스패치, 승인 결과물 버전 관리, 명시적 GRANT
-- 설계: docs/02-db-schema.md, docs/03-state-machine.md, docs/decisions.md (DR-008, DR-009)
--
-- 보안 모델
--  * authenticated: 자기 소유 행 SELECT 만 (RLS). anon: 접근 없음.
--  * 모든 쓰기: 서버/워커가 service_role 로 아래 RPC 를 호출. RPC 는 SECURITY INVOKER 이며
--    EXECUTE 권한은 service_role 에만 부여한다 (PUBLIC 기본 권한 회수).
--  * 2026-04 Supabase 변경으로 새 테이블은 Data API 에 자동 노출되지 않으므로 GRANT 를 명시한다.

-- ---------------------------------------------------------------------------
-- 0. M0 의 SECURITY DEFINER 전이 함수 제거 (apply_transition 으로 대체)
-- ---------------------------------------------------------------------------
drop function if exists public.transition_project(uuid, project_status, integer, project_status, text, text, jsonb);

-- ---------------------------------------------------------------------------
-- 1. 승인 결과물 버전 관리
-- ---------------------------------------------------------------------------
alter table public.approvals
  add column version integer not null,
  add column snapshot jsonb not null;           -- 승인 당시 콘텐츠 전체 (대본/장면/최종 props)
alter table public.approvals
  add constraint approvals_version_uniq unique (project_id, stage, version);

-- ---------------------------------------------------------------------------
-- 2. jobs = Outbox + 작업 큐
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column payload jsonb not null default '{}',
  add column result jsonb,
  add column project_revision integer not null default 0,  -- enqueue 시점 revision. 완료 시 불일치면 폐기
  add column max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  add column run_after timestamptz not null default now(),  -- 재시도 백오프
  add column locked_until timestamptz,                       -- 실행 lease. 만료되면 다른 워커가 회수
  add column dispatched_at timestamptz,                      -- 외부 실행기(Trigger.dev)에 전달된 시각
  add column dispatch_attempts integer not null default 0;

create index jobs_outbox_idx on public.jobs (run_after) where status = 'queued';
create index jobs_scene_idx on public.jobs (scene_id) where scene_id is not null;

-- ---------------------------------------------------------------------------
-- 3. FK 인덱스 (cascade·조인 성능)
-- ---------------------------------------------------------------------------
create index approvals_project_idx on public.approvals (project_id, stage, version desc);
create index approvals_approved_by_idx on public.approvals (approved_by);
create index assets_project_idx on public.assets (project_id);
create index scenes_visual_asset_idx on public.scenes (visual_asset_id) where visual_asset_id is not null;
create index scenes_narration_asset_idx on public.scenes (narration_asset_id) where narration_asset_id is not null;
create index renders_project_idx on public.renders (project_id, created_at desc);
create index renders_asset_idx on public.renders (asset_id) where asset_id is not null;
create index publications_project_idx on public.publications (project_id);
create index publications_account_idx on public.publications (instagram_account_id);
create index publications_render_idx on public.publications (render_id);

-- ---------------------------------------------------------------------------
-- 4. 명시적 GRANT
-- ---------------------------------------------------------------------------
revoke all on public.instagram_accounts, public.projects, public.scenes, public.assets, public.approvals,
  public.jobs, public.renders, public.publications, public.media_insights, public.project_events
  from anon, authenticated;

grant select on public.projects, public.scenes, public.assets, public.approvals, public.jobs,
  public.renders, public.publications, public.media_insights, public.project_events
  to authenticated;
-- 토큰 secret id 는 클라이언트에 노출하지 않는다 (컬럼 단위 GRANT)
grant select (id, user_id, ig_user_id, username, token_expires_at, scopes, created_at, updated_at)
  on public.instagram_accounts to authenticated;

grant select, insert, update, delete on public.instagram_accounts, public.projects, public.scenes,
  public.assets, public.approvals, public.jobs, public.renders, public.publications,
  public.media_insights, public.project_events
  to service_role;
grant usage, select on sequence public.project_events_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 5. apply_transition: 상태 전이 + 부수효과 + 작업(outbox) 생성을 한 트랜잭션으로
-- ---------------------------------------------------------------------------
-- 호출자(src/server/project-service.ts)는 src/domain/pipeline.ts 의 transition() 결과를
-- p_ops 로 변환해 넘긴다. 이 함수는 전이 규칙을 다시 판단하지 않고 다음만 보장한다.
--   (1) 낙관적 잠금: status·revision 이 기대값과 같을 때만 반영 (아니면 REVISION_CONFLICT)
--   (2) 소유권: p_actor_user_id 가 주어지면 프로젝트 소유자여야 함
--   (3) 모든 op 가 같은 트랜잭션에서 반영되거나 전혀 반영되지 않음
create or replace function public.apply_transition(
  p_project_id uuid,
  p_actor_user_id uuid,
  p_actor text,
  p_event text,
  p_expected_status project_status,
  p_expected_revision integer,
  p_to_status project_status,
  p_ops jsonb default '[]',
  p_error text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_new_revision integer;
  v_op jsonb;
  v_kind text;
  v_job_ids uuid[] := '{}'::uuid[];
  v_job_id uuid;
  v_version integer;
  v_scene jsonb;
  v_keep uuid[] := '{}'::uuid[];
  v_pos integer;
  v_scene_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_actor_user_id is not null and v_project.user_id <> p_actor_user_id then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';  -- 존재 여부를 노출하지 않음
  end if;
  if v_project.status <> p_expected_status or v_project.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001',
      detail = format('expected %s@%s, actual %s@%s', p_expected_status, p_expected_revision,
                      v_project.status, v_project.revision);
  end if;

  v_new_revision := v_project.revision + 1;

  update public.projects
     set status = p_to_status,
         revision = v_new_revision,
         last_error = case when p_to_status::text like '%FAILED' then p_error else null end
   where id = p_project_id;

  for v_op in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    v_kind := v_op->>'op';

    if v_kind = 'replace_script' then
      update public.projects
         set title = v_op->'script'->>'title',
             caption = coalesce(v_op->'script'->>'caption', ''),
             hashtags = coalesce(array(select jsonb_array_elements_text(v_op->'script'->'hashtags')), '{}')
       where id = p_project_id;
      -- 위치 재배치 중 unique(project_id, position) 충돌을 피하기 위해 지연 검사
      set constraints public.scenes_project_id_position_key deferred;
      v_pos := 0;
      v_keep := '{}'::uuid[];
      for v_scene in select * from jsonb_array_elements(v_op->'script'->'scenes') loop
        v_scene_id := nullif(v_scene->>'id', '')::uuid;
        if v_scene_id is not null then
          update public.scenes s
             set position = v_pos,
                 narration = v_scene->>'narration',
                 visual_prompt = v_scene->>'visualPrompt',
                 duration_sec = (v_scene->>'durationSec')::numeric,
                 -- 영상 입력이 바뀌면 기존 결과물은 stale (재생성 필요), 결과물이 없으면 pending
                 visual_status = case
                   when s.visual_prompt is distinct from v_scene->>'visualPrompt'
                     or s.duration_sec is distinct from (v_scene->>'durationSec')::numeric
                   then (case when s.visual_asset_id is null and s.visual_placeholder is null
                              then 'pending' else 'stale' end)::public.scene_part_status
                   else s.visual_status end,
                 narration_status = case
                   when s.narration is distinct from v_scene->>'narration'
                   then (case when s.narration_asset_id is null and s.narration_duration_ms is null
                              then 'pending' else 'stale' end)::public.scene_part_status
                   else s.narration_status end
           where s.id = v_scene_id and s.project_id = p_project_id;
          if not found then
            raise exception 'SCENE_NOT_FOUND' using errcode = 'P0002', detail = v_scene_id::text;
          end if;
        else
          insert into public.scenes (project_id, position, narration, visual_prompt, duration_sec)
          values (p_project_id, v_pos, v_scene->>'narration', v_scene->>'visualPrompt',
                  (v_scene->>'durationSec')::numeric)
          returning id into v_scene_id;
        end if;
        v_keep := v_keep || v_scene_id;
        v_pos := v_pos + 1;
      end loop;
      delete from public.scenes where project_id = p_project_id and not (id = any (v_keep));

    elsif v_kind = 'revoke_approvals' then
      update public.approvals
         set revoked_at = now(), revoked_reason = coalesce(v_op->>'reason', p_event)
       where project_id = p_project_id
         and revoked_at is null
         and stage::text in (select jsonb_array_elements_text(v_op->'stages'));

    elsif v_kind = 'record_approval' then
      select coalesce(max(version), 0) + 1 into v_version
        from public.approvals
       where project_id = p_project_id and stage = (v_op->>'stage')::public.approval_stage;
      -- 같은 단계의 이전 유효 승인은 대체된다
      update public.approvals
         set revoked_at = now(), revoked_reason = 'superseded'
       where project_id = p_project_id and revoked_at is null
         and stage = (v_op->>'stage')::public.approval_stage;
      insert into public.approvals (project_id, stage, content_hash, approved_by, version, snapshot)
      values (p_project_id, (v_op->>'stage')::public.approval_stage, v_op->>'contentHash',
              coalesce(p_actor_user_id, v_project.user_id), v_version, v_op->'snapshot');

    elsif v_kind = 'mark_scenes_stale' then
      if v_op->>'part' = 'visual' then
        update public.scenes set visual_status = 'stale'
         where project_id = p_project_id
           and id in (select (jsonb_array_elements_text(v_op->'sceneIds'))::uuid);
      else
        update public.scenes set narration_status = 'stale'
         where project_id = p_project_id
           and id in (select (jsonb_array_elements_text(v_op->'sceneIds'))::uuid);
      end if;

    elsif v_kind = 'invalidate_render' then
      update public.renders set is_current = false
       where project_id = p_project_id and is_current;

    elsif v_kind = 'cancel_scheduled_publication' then
      update public.publications set status = 'canceled'
       where project_id = p_project_id and status = 'scheduled';
      update public.jobs set status = 'canceled', finished_at = now()
       where project_id = p_project_id and kind = 'publish' and status in ('queued', 'running');

    elsif v_kind = 'enqueue' then
      v_job_id := null;
      insert into public.jobs (project_id, scene_id, kind, idempotency_key, payload,
                               project_revision, max_attempts, provider)
      values (p_project_id, nullif(v_op->>'sceneId', '')::uuid, (v_op->>'kind')::public.job_kind,
              v_op->>'idempotencyKey', coalesce(v_op->'payload', '{}'), v_new_revision,
              coalesce((v_op->>'maxAttempts')::integer, 3), v_op->>'provider')
      on conflict (idempotency_key) where status in ('queued', 'running', 'succeeded') do nothing
      returning id into v_job_id;
      if v_job_id is not null then
        v_job_ids := v_job_ids || v_job_id;
      end if;

    elsif v_kind = 'complete_job' then
      update public.jobs
         set status = 'succeeded', result = v_op->'result', finished_at = now(), locked_until = null,
             error = null
       where id = (v_op->>'jobId')::uuid and project_id = p_project_id and status = 'running';
      if not found then
        raise exception 'JOB_NOT_RUNNING' using errcode = 'P0001', detail = v_op->>'jobId';
      end if;

    elsif v_kind = 'fail_job' then
      update public.jobs
         set status = 'failed', error = v_op->>'error',
             error_retryable = coalesce((v_op->>'retryable')::boolean, false),
             finished_at = now(), locked_until = null
       where id = (v_op->>'jobId')::uuid and project_id = p_project_id and status = 'running';
      if not found then
        raise exception 'JOB_NOT_RUNNING' using errcode = 'P0001', detail = v_op->>'jobId';
      end if;

    else
      raise exception 'UNKNOWN_OP %', v_kind using errcode = '22023';
    end if;
  end loop;

  insert into public.project_events (project_id, actor, event, from_status, to_status, payload)
  values (p_project_id, p_actor, p_event, p_expected_status, p_to_status,
          jsonb_build_object('ops', (select coalesce(jsonb_agg(o->>'op'), '[]'::jsonb)
                                     from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) o),
                             'error', p_error));

  return jsonb_build_object('revision', v_new_revision, 'status', p_to_status, 'jobIds', to_jsonb(v_job_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 작업 실행 RPC (lease 기반, 중복 실행 방지)
-- ---------------------------------------------------------------------------
-- 지정한 작업을 실행 상태로 가져온다. 이미 다른 워커가 lease 를 가진 경우 null.
create or replace function public.claim_job(p_job_id uuid, p_lease_seconds integer default 300)
returns public.jobs
language sql
security invoker
set search_path = ''
as $$
  update public.jobs
     set status = 'running',
         attempt = attempt + 1,
         started_at = coalesce(started_at, now()),
         locked_until = now() + make_interval(secs => p_lease_seconds)
   where id = (
     select id from public.jobs
      where id = p_job_id
        and ((status = 'queued' and run_after <= now())
          or (status = 'running' and locked_until < now()))  -- lease 만료된 작업 회수
      for update skip locked
   )
  returning *;
$$;

-- 재시도 가능한 실패: 시도 횟수가 남았으면 백오프 후 다시 queued, 아니면 'exhausted'
create or replace function public.release_job_for_retry(
  p_job_id uuid, p_error text, p_delay_seconds integer
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' then
    return 'not_running';
  end if;
  if v_job.attempt >= v_job.max_attempts then
    return 'exhausted';
  end if;
  update public.jobs
     set status = 'queued', error = p_error, error_retryable = true, locked_until = null,
         run_after = now() + make_interval(secs => p_delay_seconds),
         dispatched_at = null
   where id = p_job_id;
  return 'requeued';
end;
$$;

-- 상위 상태가 바뀌어 더 이상 유효하지 않은 작업 폐기
create or replace function public.cancel_job(p_job_id uuid, p_reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.jobs
     set status = 'canceled', error = p_reason, finished_at = now(), locked_until = null
   where id = p_job_id and status in ('queued', 'running');
$$;

-- Outbox 디스패치 기록
create or replace function public.mark_job_dispatched(p_job_id uuid, p_run_id text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.jobs
     set dispatched_at = now(), dispatch_attempts = dispatch_attempts + 1,
         trigger_run_id = coalesce(p_run_id, trigger_run_id)
   where id = p_job_id;
$$;

-- 아직 전달되지 않았거나(dispatched_at null) lease 가 만료된 작업 목록 (스윕용)
create or replace function public.list_dispatchable_jobs(p_limit integer default 50)
returns setof public.jobs
language sql
security invoker
stable
set search_path = ''
as $$
  select * from public.jobs
   where (status = 'queued' and run_after <= now() and dispatched_at is null)
      or (status = 'queued' and run_after <= now() and dispatched_at < now() - interval '10 minutes')
      or (status = 'running' and locked_until < now())
   order by run_after
   limit p_limit;
$$;

revoke all on function public.apply_transition(uuid, uuid, text, text, project_status, integer, project_status, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_job_for_retry(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.cancel_job(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_job_dispatched(uuid, text) from public, anon, authenticated;
revoke all on function public.list_dispatchable_jobs(integer) from public, anon, authenticated;

grant execute on function public.apply_transition(uuid, uuid, text, text, project_status, integer, project_status, jsonb, text) to service_role;
grant execute on function public.claim_job(uuid, integer) to service_role;
grant execute on function public.release_job_for_retry(uuid, text, integer) to service_role;
grant execute on function public.cancel_job(uuid, text) to service_role;
grant execute on function public.mark_job_dispatched(uuid, text) to service_role;
grant execute on function public.list_dispatchable_jobs(integer) to service_role;

-- 새로 만드는 함수가 PUBLIC 실행 권한을 기본으로 갖지 않도록
alter default privileges in schema public revoke execute on functions from public;

-- advisor 0011 (function_search_path_mutable) 대응
alter function public.set_updated_at() set search_path = '';
revoke all on function public.set_updated_at() from public, anon, authenticated;
