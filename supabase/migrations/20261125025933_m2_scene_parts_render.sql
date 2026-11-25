-- M2: 장면 단위 결과 반영, 장면 수정, 렌더 결과, enqueue 시 장면 상태 표시
-- 설계: docs/02-db-schema.md §4, docs/decisions.md DR-011
--
-- 1) apply_transition 재정의: op 추가 (update_scene, create_render, complete_render, fail_render),
--    enqueue 시 대상 장면의 영상/나레이션 상태를 generating 으로 표시
-- 2) complete_scene_part: 장면 작업 1건의 결과(또는 실패)를 반영하고, 같은 종류의 장면 작업이
--    모두 끝났으면 프로젝트 상태 전이까지 한 트랜잭션에서 처리 (목표 상태는 호출자가 도메인 상태 머신으로 계산)

-- 장면 결과물 자산 기록 (assets insert) 공통 함수
create or replace function public._insert_asset(p_user_id uuid, p_project_id uuid, p_kind public.asset_kind, p_asset jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.assets (user_id, project_id, kind, storage_path, mime_type, size_bytes, duration_ms, provider, input_key)
  values (p_user_id, p_project_id, p_kind, p_asset->>'storagePath', p_asset->>'mimeType',
          nullif(p_asset->>'sizeBytes', '')::bigint, nullif(p_asset->>'durationMs', '')::integer,
          coalesce(p_asset->>'provider', 'unknown'), p_asset->>'inputKey')
  returning id;
$$;

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
  v_asset_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_actor_user_id is not null and v_project.user_id <> p_actor_user_id then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
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

    elsif v_kind = 'update_scene' then
      -- 장면 하나의 영상 프롬프트·길이·나레이션 수정. 바뀐 부분만 stale/pending.
      update public.scenes s
         set visual_prompt = coalesce(v_op->>'visualPrompt', s.visual_prompt),
             duration_sec = coalesce((v_op->>'durationSec')::numeric, s.duration_sec),
             narration = coalesce(v_op->>'narration', s.narration),
             visual_status = case
               when (v_op ? 'visualPrompt' and s.visual_prompt is distinct from v_op->>'visualPrompt')
                 or (v_op ? 'durationSec' and s.duration_sec is distinct from (v_op->>'durationSec')::numeric)
               then (case when s.visual_asset_id is null and s.visual_placeholder is null
                          then 'pending' else 'stale' end)::public.scene_part_status
               else s.visual_status end,
             narration_status = case
               when v_op ? 'narration' and s.narration is distinct from v_op->>'narration'
               then (case when s.narration_asset_id is null and s.narration_duration_ms is null
                          then 'pending' else 'stale' end)::public.scene_part_status
               else s.narration_status end
       where s.id = (v_op->>'sceneId')::uuid and s.project_id = p_project_id;
      if not found then
        raise exception 'SCENE_NOT_FOUND' using errcode = 'P0002', detail = v_op->>'sceneId';
      end if;

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

    elsif v_kind = 'create_render' then
      -- 최종 승인 시점의 컴포지션 스냅샷. invalidate_render 다음에 와야 한다 (프로젝트당 current 1개)
      insert into public.renders (project_id, composition_hash, input_props, status, is_current)
      values (p_project_id, v_op->>'compositionHash', v_op->'inputProps', 'queued', true);

    elsif v_kind = 'complete_render' then
      v_asset_id := public._insert_asset(v_project.user_id, p_project_id, 'render', v_op->'asset');
      update public.renders
         set status = 'succeeded', asset_id = v_asset_id, error = null
       where id = (v_op->>'renderId')::uuid and project_id = p_project_id and is_current;
      if not found then
        raise exception 'RENDER_NOT_CURRENT' using errcode = 'P0001', detail = v_op->>'renderId';
      end if;

    elsif v_kind = 'fail_render' then
      update public.renders set status = 'failed', error = v_op->>'error'
       where id = (v_op->>'renderId')::uuid and project_id = p_project_id;

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
        -- 장면 작업이면 해당 장면을 생성 중으로 표시 (UI 진행 표시 + 집계 기준)
        if v_op->>'kind' = 'scene_video' then
          update public.scenes set visual_status = 'generating' where id = (v_op->>'sceneId')::uuid;
        elsif v_op->>'kind' = 'narration' then
          update public.scenes set narration_status = 'generating' where id = (v_op->>'sceneId')::uuid;
        end if;
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
-- 장면 작업 1건 완료/실패 반영 + (마지막 작업이면) 프로젝트 상태 전이
-- ---------------------------------------------------------------------------
-- p_result (성공 시)
--   영상: { "placeholder": {...} | null, "asset": {storagePath,mimeType,...} | null, "inputKey": "..." }
--   나레이션: { "asset": {...} | null, "durationMs": 1234, "captions": [...], "inputKey": "..." }
-- 반환: { "aggregate": "in_progress" | "succeeded" | "failed", "status": ..., "revision": ... }
create or replace function public.complete_scene_part(
  p_job_id uuid,
  p_ok boolean,
  p_result jsonb,
  p_error text,
  p_running_status project_status,
  p_success_status project_status,
  p_failure_status project_status,
  p_success_event text,
  p_failure_event text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_project public.projects%rowtype;
  v_part text;
  v_asset_id uuid;
  v_busy integer;
  v_failed integer;
  v_total integer;
  v_to public.project_status;
  v_event text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' or v_job.scene_id is null then
    raise exception 'JOB_NOT_RUNNING' using errcode = 'P0001', detail = p_job_id::text;
  end if;
  select * into v_project from public.projects where id = v_job.project_id for update;
  if v_project.status <> p_running_status or v_project.revision <> v_job.project_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001',
      detail = format('job rev %s, project %s@%s', v_job.project_revision, v_project.status, v_project.revision);
  end if;

  v_part := case v_job.kind when 'scene_video' then 'visual' when 'narration' then 'narration' end;
  if v_part is null then
    raise exception 'NOT_A_SCENE_JOB %', v_job.kind using errcode = '22023';
  end if;

  if p_ok then
    v_asset_id := null;
    if p_result ? 'asset' and jsonb_typeof(p_result->'asset') = 'object' then
      v_asset_id := public._insert_asset(v_project.user_id, v_project.id,
        (case v_part when 'visual' then 'scene_video' else 'narration_audio' end)::public.asset_kind,
        p_result->'asset');
    end if;
    if v_part = 'visual' then
      update public.scenes
         set visual_status = 'ready', visual_asset_id = v_asset_id,
             visual_placeholder = case when jsonb_typeof(p_result->'placeholder') = 'object' then p_result->'placeholder' end,
             visual_input_hash = p_result->>'inputKey'
       where id = v_job.scene_id;
    else
      update public.scenes
         set narration_status = 'ready', narration_asset_id = v_asset_id,
             narration_duration_ms = (p_result->>'durationMs')::integer,
             captions = coalesce(p_result->'captions', '[]'::jsonb),
             narration_input_hash = p_result->>'inputKey'
       where id = v_job.scene_id;
    end if;
    update public.jobs
       set status = 'succeeded', result = p_result - 'captions', finished_at = now(), locked_until = null, error = null
     where id = p_job_id;
  else
    if v_part = 'visual' then
      update public.scenes set visual_status = 'failed' where id = v_job.scene_id;
    else
      update public.scenes set narration_status = 'failed' where id = v_job.scene_id;
    end if;
    update public.jobs
       set status = 'failed', error = p_error, finished_at = now(), locked_until = null
     where id = p_job_id;
  end if;

  -- 같은 파트의 장면 집계 (src/domain/pipeline.ts aggregateSceneStatuses 와 같은 규칙)
  select count(*) filter (where (case v_part when 'visual' then visual_status else narration_status end)
                                  in ('pending', 'generating')),
         count(*) filter (where (case v_part when 'visual' then visual_status else narration_status end)
                                  in ('failed', 'stale')),
         count(*)
    into v_busy, v_failed, v_total
    from public.scenes where project_id = v_project.id;

  if v_busy > 0 then
    return jsonb_build_object('aggregate', 'in_progress', 'status', v_project.status, 'revision', v_project.revision);
  end if;

  if v_failed = 0 and v_total > 0 then
    v_to := p_success_status; v_event := p_success_event;
  else
    v_to := p_failure_status; v_event := p_failure_event;
  end if;

  update public.projects
     set status = v_to, revision = revision + 1,
         last_error = case when v_to = p_failure_status
                           then coalesce(p_error, format('%s개 장면 생성 실패', v_failed)) else null end
   where id = v_project.id;
  insert into public.project_events (project_id, actor, event, from_status, to_status, payload)
  values (v_project.id, 'worker:' || v_job.kind, v_event, p_running_status, v_to,
          jsonb_build_object('failedScenes', v_failed, 'lastJob', p_job_id));

  return jsonb_build_object('aggregate', case when v_to = p_success_status then 'succeeded' else 'failed' end,
                            'status', v_to, 'revision', v_project.revision + 1);
end;
$$;

revoke all on function public._insert_asset(uuid, uuid, public.asset_kind, jsonb) from public, anon, authenticated;
revoke all on function public.complete_scene_part(uuid, boolean, jsonb, text, project_status, project_status, project_status, text, text) from public, anon, authenticated;
grant execute on function public._insert_asset(uuid, uuid, public.asset_kind, jsonb) to service_role;
grant execute on function public.complete_scene_part(uuid, boolean, jsonb, text, project_status, project_status, project_status, text, text) to service_role;
