-- Keep guest-profile visit counts aligned with real visits, not cancellations or no-shows.

create or replace function reservation_demo.guest_profile_payload(p_profile_id uuid)
returns jsonb
language sql
stable
set search_path = reservation_demo, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', gp.id,
    'guestLabel', gp.guest_label,
    'contact', gp.contact_placeholder,
    'tags', to_jsonb(gp.tags),
    'preferences', to_jsonb(gp.preferences),
    'privateNote', gp.private_note,
    'visitCount', coalesce(v.visit_count, 0),
    'upcomingCount', coalesce(v.upcoming_count, 0),
    'lastVisitAt', v.last_visit_at,
    'createdAt', gp.created_at,
    'updatedAt', gp.updated_at,
    'visits', coalesce(v.visits, '[]'::jsonb)
  )
  from reservation_demo.guest_profiles gp
  left join lateral (
    select
      count(*) filter (where b.status not in ('cancelled','no_show'))::integer as visit_count,
      count(*) filter (where b.starts_at >= now() and b.status not in ('cancelled','no_show'))::integer as upcoming_count,
      max(b.starts_at) filter (where b.starts_at < now() and b.status not in ('cancelled','no_show')) as last_visit_at,
      jsonb_agg(jsonb_build_object(
        'reference', b.reference,
        'status', b.status,
        'partySize', b.party_size,
        'section', b.section,
        'startsAt', b.starts_at,
        'tableCode', t.code
      ) order by b.starts_at desc, b.created_at desc) filter (where b.id is not null) as visits
    from reservation_demo.bookings b
    left join reservation_demo.allocations a on a.booking_id = b.id
    left join reservation_demo.demo_tables t on t.id = a.table_id
    where b.guest_profile_id = gp.id
  ) v on true
  where gp.id = p_profile_id
$$;
