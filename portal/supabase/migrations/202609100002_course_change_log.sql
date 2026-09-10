create table if not exists public.course_change_log (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('course', 'course_version', 'phase', 'lesson', 'lesson_acs_item')),
  entity_id text not null,
  course_id uuid,
  course_version_id uuid,
  action text not null check (action in ('baseline', 'created', 'updated', 'deleted')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb
);

create index if not exists course_change_log_course_idx
  on public.course_change_log(course_id, changed_at desc);
create index if not exists course_change_log_version_idx
  on public.course_change_log(course_version_id, changed_at desc);
create unique index if not exists course_change_log_baseline_idx
  on public.course_change_log(entity_type, entity_id)
  where action = 'baseline';

alter table public.course_change_log enable row level security;

drop policy if exists "staff_read_course_change_log" on public.course_change_log;
create policy "staff_read_course_change_log" on public.course_change_log
for select to authenticated
using (public.is_portal_staff());

revoke insert, update, delete on public.course_change_log from anon, authenticated;
grant select on public.course_change_log to authenticated;

create or replace function public.prevent_course_change_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Course history is append-only and cannot be changed or deleted.';
end;
$$;

drop trigger if exists protect_course_change_log on public.course_change_log;
create trigger protect_course_change_log
before update or delete on public.course_change_log
for each row execute function public.prevent_course_change_log_mutation();

-- Preserve the course structure that exists when this migration is installed.
insert into public.course_change_log (entity_type, entity_id, course_id, action, after_data)
select 'course', c.id::text, c.id, 'baseline', to_jsonb(c)
from public.courses c
where not exists (
  select 1 from public.course_change_log h
  where h.entity_type = 'course' and h.entity_id = c.id::text and h.action = 'baseline'
);

insert into public.course_change_log (entity_type, entity_id, course_id, course_version_id, action, after_data)
select 'course_version', cv.id::text, cv.course_id, cv.id, 'baseline', to_jsonb(cv)
from public.course_versions cv
where not exists (
  select 1 from public.course_change_log h
  where h.entity_type = 'course_version' and h.entity_id = cv.id::text and h.action = 'baseline'
);

insert into public.course_change_log (entity_type, entity_id, course_id, course_version_id, action, after_data)
select 'phase', p.id::text, cv.course_id, p.course_version_id, 'baseline', to_jsonb(p)
from public.phases p
join public.course_versions cv on cv.id = p.course_version_id
where not exists (
  select 1 from public.course_change_log h
  where h.entity_type = 'phase' and h.entity_id = p.id::text and h.action = 'baseline'
);

insert into public.course_change_log (entity_type, entity_id, course_id, course_version_id, action, after_data)
select 'lesson', l.id::text, cv.course_id, p.course_version_id, 'baseline', to_jsonb(l)
from public.lessons l
join public.phases p on p.id = l.phase_id
join public.course_versions cv on cv.id = p.course_version_id
where not exists (
  select 1 from public.course_change_log h
  where h.entity_type = 'lesson' and h.entity_id = l.id::text and h.action = 'baseline'
);

insert into public.course_change_log (entity_type, entity_id, course_id, course_version_id, action, after_data)
select
  'lesson_acs_item',
  lai.lesson_id::text || ':' || lai.acs_item_id::text,
  cv.course_id,
  p.course_version_id,
  'baseline',
  to_jsonb(lai)
from public.lesson_acs_items lai
join public.lessons l on l.id = lai.lesson_id
join public.phases p on p.id = l.phase_id
join public.course_versions cv on cv.id = p.course_version_id
where not exists (
  select 1 from public.course_change_log h
  where h.entity_type = 'lesson_acs_item'
    and h.entity_id = lai.lesson_id::text || ':' || lai.acs_item_id::text
    and h.action = 'baseline'
);

create or replace function public.capture_course_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  resolved_course_id uuid;
  resolved_version_id uuid;
  resolved_entity_id text;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  snapshot := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'courses' then
    resolved_course_id := (snapshot ->> 'id')::uuid;
    resolved_entity_id := snapshot ->> 'id';
  elsif tg_table_name = 'course_versions' then
    resolved_course_id := (snapshot ->> 'course_id')::uuid;
    resolved_version_id := (snapshot ->> 'id')::uuid;
    resolved_entity_id := snapshot ->> 'id';
  elsif tg_table_name = 'phases' then
    resolved_version_id := (snapshot ->> 'course_version_id')::uuid;
    select cv.course_id into resolved_course_id
    from public.course_versions cv
    where cv.id = resolved_version_id;
    resolved_entity_id := snapshot ->> 'id';
  elsif tg_table_name = 'lessons' then
    select p.course_version_id, cv.course_id
      into resolved_version_id, resolved_course_id
    from public.phases p
    join public.course_versions cv on cv.id = p.course_version_id
    where p.id = (snapshot ->> 'phase_id')::uuid;
    resolved_entity_id := snapshot ->> 'id';
  elsif tg_table_name = 'lesson_acs_items' then
    select p.course_version_id, cv.course_id
      into resolved_version_id, resolved_course_id
    from public.lessons l
    join public.phases p on p.id = l.phase_id
    join public.course_versions cv on cv.id = p.course_version_id
    where l.id = (snapshot ->> 'lesson_id')::uuid;
    resolved_entity_id := (snapshot ->> 'lesson_id') || ':' || (snapshot ->> 'acs_item_id');
  end if;

  insert into public.course_change_log (
    entity_type,
    entity_id,
    course_id,
    course_version_id,
    action,
    changed_by,
    before_data,
    after_data
  ) values (
    case tg_table_name
      when 'courses' then 'course'
      when 'course_versions' then 'course_version'
      when 'phases' then 'phase'
      when 'lessons' then 'lesson'
      when 'lesson_acs_items' then 'lesson_acs_item'
    end,
    resolved_entity_id,
    resolved_course_id,
    resolved_version_id,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_course_change() from public;

drop trigger if exists audit_courses on public.courses;
create trigger audit_courses before insert or update or delete on public.courses
for each row execute function public.capture_course_change();

drop trigger if exists audit_course_versions on public.course_versions;
create trigger audit_course_versions before insert or update or delete on public.course_versions
for each row execute function public.capture_course_change();

drop trigger if exists audit_phases on public.phases;
create trigger audit_phases before insert or update or delete on public.phases
for each row execute function public.capture_course_change();

drop trigger if exists audit_lessons on public.lessons;
create trigger audit_lessons before insert or update or delete on public.lessons
for each row execute function public.capture_course_change();

drop trigger if exists audit_lesson_acs_items on public.lesson_acs_items;
create trigger audit_lesson_acs_items before insert or update or delete on public.lesson_acs_items
for each row execute function public.capture_course_change();
