-- Add protected operator reservation-detail editing for the iPad drawer.

alter table reservation_demo.bookings
  add column if not exists operator_note text not null default '';

alter table reservation_demo.bookings
  drop constraint if exists bookings_operator_note_length;

alter table reservation_demo.bookings
  add constraint bookings_operator_note_length check (length(operator_note) <= 400);

comment on column reservation_demo.bookings.operator_note is 'Private host note shown only in the protected operator demo.';

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
        'contact', b.contact_placeholder,
        'operatorNote', coalesce(b.operator_note, ''),
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

create or replace function public.reservation_demo_operator_edit(payload jsonb, secret text)
returns jsonb
language plpgsql
security definer
set search_path = reservation_demo, public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_operator boolean := coalesce((payload->>'operator')::boolean, false);
  v_reference text := payload->>'reference';
  v_booking reservation_demo.bookings%rowtype;
  v_service reservation_demo.service_days%rowtype;
  v_date date;
  v_time time;
  v_party integer;
  v_section text;
  v_guest text;
  v_contact text;
  v_note text;
  v_start timestamptz;
  v_end timestamptz;
  v_current_code text;
  v_assignment_status text;
  v_candidate record;
begin
  select api_secret_hash into v_hash from reservation_demo.demo_config where id = 1;
  if v_hash is null or reservation_demo.hash_secret(secret) <> v_hash or not v_operator then
    return jsonb_build_object('ok', false, 'error', 'operator_unauthorized');
  end if;

  perform reservation_demo.ensure_seed();
  perform reservation_demo.ensure_table_combinations();
  perform reservation_demo.expire_holds();

  select * into v_booking
  from reservation_demo.bookings
  where reference = v_reference;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_booking.status not in ('confirmed','checked_in','seated') then
    return jsonb_build_object('ok', false, 'error', 'operator_edit_unavailable');
  end if;

  begin
    v_date := coalesce(nullif(payload->>'date', '')::date, v_booking.service_date);
    v_time := coalesce(nullif(payload->>'time', '')::time, v_booking.start_time);
    v_party := coalesce(nullif(payload->>'partySize', '')::integer, v_booking.party_size);
    v_section := coalesce(nullif(payload->>'section', ''), v_booking.section);
    v_guest := left(coalesce(nullif(btrim(payload->>'guestLabel'), ''), v_booking.guest_label, 'Demo Guest'), 80);
    v_contact := left(coalesce(nullif(btrim(payload->>'contact'), ''), v_booking.contact_placeholder, ''), 96);
    v_note := left(coalesce(payload->>'operatorNote', payload->>'note', v_booking.operator_note, ''), 400);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_operator_edit');
  end;

  if v_party < 1 or v_party > 12 or v_section not in ('indoor','outdoor') then
    return jsonb_build_object('ok', false, 'error', 'invalid_operator_edit');
  end if;

  select * into v_service
  from reservation_demo.service_days
  where venue_id = v_booking.venue_id
    and service_date = v_date
    and status = 'open';

  if not found or v_time < v_service.booking_start or v_time > v_service.booking_end then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  if not reservation_demo.pacing_allows_booking(v_booking.venue_id, v_date, v_time, v_party, v_booking.id, v_booking.hold_id) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  v_start := reservation_demo.slot_start_at(v_date, v_time);
  v_end := v_start + ((v_service.turn_minutes::text || ' minutes')::interval);
  v_current_code := reservation_demo.booking_table_code(v_booking.id);
  v_assignment_status := case
    when v_booking.status = 'seated' then 'seated'
    when v_booking.status = 'checked_in' then 'checked_in'
    else 'confirmed'
  end;

  for v_candidate in
    with candidates as (
      select t.code, t.section, t.min_party, t.max_party, t.display_order, false as combo
      from reservation_demo.demo_tables t
      where t.venue_id = v_booking.venue_id and t.active
      union all
      select c.code, c.section, c.min_party, c.max_party, c.display_order, true as combo
      from reservation_demo.table_combinations c
      where c.venue_id = v_booking.venue_id and c.active
    )
    select *
    from candidates
    where section = v_section
      and min_party <= v_party
      and max_party >= v_party
    order by case when code = v_current_code then 0 else 1 end,
             combo asc,
             max_party asc,
             display_order asc
  loop
    begin
      update reservation_demo.allocations
      set status = 'released'
      where booking_id = v_booking.id
        and status not in ('released','expired','cancelled','completed');

      insert into reservation_demo.allocations(table_id, booking_id, starts_at, ends_at, status)
      select table_id, v_booking.id, v_start, v_end, v_assignment_status
      from reservation_demo.resolve_table_assignment(v_booking.venue_id, v_candidate.code);

      update reservation_demo.bookings
      set party_size = v_party,
          section = v_candidate.section,
          starts_at = v_start,
          ends_at = v_end,
          service_date = v_date,
          start_time = v_time,
          guest_label = v_guest,
          contact_placeholder = v_contact,
          operator_note = v_note,
          updated_at = now()
      where id = v_booking.id
      returning * into v_booking;

      insert into reservation_demo.audit_events(actor, action, booking_id, detail)
      values ('operator-demo', 'operator_reservation_edit', v_booking.id, jsonb_build_object(
        'tableCode', v_candidate.code,
        'partySize', v_party,
        'section', v_candidate.section,
        'startsAt', v_start
      ));

      return jsonb_build_object(
        'ok', true,
        'reservation', jsonb_build_object(
          'reference', v_booking.reference,
          'status', v_booking.status,
          'partySize', v_booking.party_size,
          'section', v_booking.section,
          'startsAt', v_booking.starts_at,
          'endsAt', v_booking.ends_at,
          'guestLabel', v_booking.guest_label,
          'contact', v_booking.contact_placeholder,
          'operatorNote', v_booking.operator_note,
          'tableCode', reservation_demo.booking_table_code(v_booking.id),
          'tableCodes', to_jsonb(reservation_demo.booking_table_codes(v_booking.id)),
          'serviceStage', v_booking.service_stage,
          'serviceStageUpdatedAt', v_booking.service_stage_updated_at,
          'turnRisk', reservation_demo.booking_turn_risk(v_booking.status, v_booking.service_stage, v_booking.ends_at)
        ),
        'tableCode', reservation_demo.booking_table_code(v_booking.id),
        'tableCodes', to_jsonb(reservation_demo.booking_table_codes(v_booking.id)),
        'demo', true
      );
    exception when exclusion_violation then
      -- Try the next compatible table or table combination.
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'operator_edit_error', 'code', sqlstate);
end;
$$;

revoke all on function public.reservation_demo_operator_list(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_list(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_list(jsonb, text) to authenticated;
revoke all on function public.reservation_demo_operator_edit(jsonb, text) from public;
grant execute on function public.reservation_demo_operator_edit(jsonb, text) to anon;
grant execute on function public.reservation_demo_operator_edit(jsonb, text) to authenticated;

comment on function public.reservation_demo_operator_edit(jsonb,text) is 'Server-secret-gated operator reservation detail edit for the synthetic ResyOS-style iPad demo.';
