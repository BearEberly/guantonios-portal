-- Add manual ResyOS-style service-stage tracking for seated parties.

alter table reservation_demo.bookings
  add column if not exists service_stage text not null default 'not_started',
  add column if not exists service_stage_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_service_stage_check'
      and conrelid = 'reservation_demo.bookings'::regclass
  ) then
    alter table reservation_demo.bookings
      add constraint bookings_service_stage_check
      check (service_stage in ('not_started','ordered','fired','entrees','dessert','check_dropped','paid'));
  end if;
end $$;

create index if not exists bookings_service_stage_idx
  on reservation_demo.bookings(status, service_stage, starts_at)
  where status = 'seated';

create or replace function reservation_demo.booking_turn_risk(p_status text, p_service_stage text, p_ends_at timestamptz)
returns text
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select case
    when p_status <> 'seated' then 'not_seated'
    when p_service_stage = 'paid' then 'ready_to_turn'
    when now() >= p_ends_at then 'over_turn'
    when now() >= p_ends_at - interval '15 minutes' then 'approaching_turn'
    else 'on_pace'
  end
$$;

create or replace function public.reservation_demo_operator_service(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_reference text := payload->>'reference';
  v_stage text := coalesce(nullif(payload->>'serviceStage', ''), nullif(payload->>'stage', ''));
  v_booking reservation_demo.bookings%rowtype;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.expire_holds();

  if v_stage not in ('not_started','ordered','fired','entrees','dessert','check_dropped','paid') then
    return jsonb_build_object('ok', false, 'error', 'invalid_service_stage');
  end if;

  select * into v_booking from reservation_demo.bookings where reference = v_reference;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status <> 'seated' then
    return jsonb_build_object('ok', false, 'error', 'service_stage_unavailable');
  end if;

  update reservation_demo.bookings
  set service_stage = v_stage,
      service_stage_updated_at = case when v_stage = 'not_started' then null else now() end,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  insert into reservation_demo.audit_events (actor, action, booking_id, detail)
  values ('operator-demo', 'operator_service_stage', v_booking.id, jsonb_build_object('serviceStage', v_stage));

  return jsonb_build_object(
    'ok', true,
    'reference', v_booking.reference,
    'serviceStage', v_booking.service_stage,
    'serviceStageUpdatedAt', v_booking.service_stage_updated_at,
    'turnRisk', reservation_demo.booking_turn_risk(v_booking.status, v_booking.service_stage, v_booking.ends_at),
    'demo', true
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', 'operator_service_error', 'code', sqlstate);
end;
$$;

create or replace function public.reservation_demo_operator_list(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_venue uuid;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();
  perform reservation_demo.expire_holds();
  select id into v_venue from reservation_demo.venues where slug = 'guantonios-demo';

  return jsonb_build_object(
    'ok', true,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', b.reference,
        'status', b.status,
        'partySize', b.party_size,
        'section', b.section,
        'startsAt', b.starts_at,
        'endsAt', b.ends_at,
        'tableCode', reservation_demo.booking_table_code(b.id),
        'tableCodes', to_jsonb(reservation_demo.booking_table_codes(b.id)),
        'serviceStage', b.service_stage,
        'serviceStageUpdatedAt', b.service_stage_updated_at,
        'turnRisk', reservation_demo.booking_turn_risk(b.status, b.service_stage, b.ends_at),
        'guestLabel', b.guest_label,
        'guestProfileId', gp.id,
        'guestTags', coalesce(to_jsonb(gp.tags), '[]'::jsonb),
        'guestPreferences', coalesce(to_jsonb(gp.preferences), '[]'::jsonb),
        'visitCount', coalesce((
          select count(*)::integer
          from reservation_demo.bookings vb
          where vb.guest_profile_id = gp.id and vb.status <> 'cancelled'
        ), 0),
        'privateNotePreview', case when gp.private_note <> '' then left(gp.private_note, 90) else '' end,
        'createdAt', b.created_at
      ) order by b.starts_at, b.created_at)
      from reservation_demo.bookings b
      left join reservation_demo.guest_profiles gp on gp.id = b.guest_profile_id
    ), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'partySize', h.party_size, 'section', h.section, 'startsAt', h.starts_at, 'expiresAt', h.expires_at, 'status', h.status) order by h.created_at desc)
      from reservation_demo.holds h
      where h.created_at > now() - interval '2 hours'
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('eventType', n.event_type, 'status', n.status, 'adapter', n.adapter, 'preview', n.preview, 'createdAt', n.created_at) order by n.created_at desc)
      from reservation_demo.notification_events n
    ), '[]'::jsonb),
    'demo', true
  );
end;
$$;

revoke all on function reservation_demo.booking_turn_risk(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reservation_demo_operator_service(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_service(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_service(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_operator_list(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_list(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_list(jsonb, text) to authenticated;

comment on column reservation_demo.bookings.service_stage is 'Manual demo service progress selected by the iPad operator for seated parties only.';
comment on function public.reservation_demo_operator_service(jsonb,text) is 'Server-secret-gated operator service-stage control for the synthetic reservation demo.';
