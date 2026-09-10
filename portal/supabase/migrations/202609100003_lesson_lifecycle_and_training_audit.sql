alter table public.lesson_attempts
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists flight_minutes integer not null default 0 check (flight_minutes >= 0),
  add column if not exists simulator_minutes integer not null default 0 check (simulator_minutes >= 0);

update public.lesson_attempts a
set
  flight_minutes = case when l.kind = 'flight' then a.training_minutes else 0 end,
  simulator_minutes = case when l.kind = 'simulator' then a.training_minutes else 0 end,
  closed_at = case when a.status = 'published' then coalesce(a.published_at, a.updated_at) else null end
from public.lessons l
where l.id = a.lesson_id
  and a.flight_minutes = 0
  and a.simulator_minutes = 0;

create table if not exists public.remediation_requirements (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  acs_item_id uuid not null references public.acs_items(id) on delete restrict,
  source_attempt_id uuid not null references public.lesson_attempts(id) on delete restrict,
  required_lesson_id uuid references public.lessons(id) on delete restrict,
  reason public.ogmui_grade not null check (reason in ('U', 'I')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_attempt_id uuid references public.lesson_attempts(id) on delete restrict
);

create unique index if not exists remediation_requirements_open_item_idx
  on public.remediation_requirements(enrollment_id, acs_item_id)
  where resolved_at is null;
create index if not exists remediation_requirements_enrollment_idx
  on public.remediation_requirements(enrollment_id, resolved_at, opened_at);

create table if not exists public.lesson_attempt_items (
  id uuid primary key default gen_random_uuid(),
  lesson_attempt_id uuid not null references public.lesson_attempts(id) on delete cascade,
  acs_item_id uuid not null references public.acs_items(id) on delete restrict,
  source text not null check (source in ('planned', 'carryover_incomplete', 'repeat_unsatisfactory')),
  remediation_requirement_id uuid references public.remediation_requirements(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (lesson_attempt_id, acs_item_id)
);

create index if not exists lesson_attempt_items_attempt_idx
  on public.lesson_attempt_items(lesson_attempt_id, sort_order);

insert into public.lesson_attempt_items (lesson_attempt_id, acs_item_id, source, sort_order)
select g.lesson_attempt_id, g.acs_item_id, 'planned', row_number() over (partition by g.lesson_attempt_id order by ai.sort_order)::integer
from public.grades g
join public.acs_items ai on ai.id = g.acs_item_id
on conflict (lesson_attempt_id, acs_item_id) do nothing;

insert into public.lesson_attempt_items (lesson_attempt_id, acs_item_id, source, sort_order)
select a.id, lai.acs_item_id, 'planned', lai.sort_order
from public.lesson_attempts a
join public.lesson_acs_items lai on lai.lesson_id = a.lesson_id
where a.status = 'draft'
on conflict (lesson_attempt_id, acs_item_id) do nothing;

with latest_grades as (
  select distinct on (a.enrollment_id, g.acs_item_id)
    a.enrollment_id,
    g.acs_item_id,
    a.id as source_attempt_id,
    a.lesson_id,
    g.grade,
    coalesce(a.published_at, a.conducted_at) as graded_at
  from public.lesson_attempts a
  join public.grades g on g.lesson_attempt_id = a.id
  where a.status = 'published'
  order by a.enrollment_id, g.acs_item_id, coalesce(a.published_at, a.conducted_at) desc, a.attempt_number desc
)
insert into public.remediation_requirements (enrollment_id, acs_item_id, source_attempt_id, required_lesson_id, reason, opened_at)
select enrollment_id, acs_item_id, source_attempt_id,
  case when grade = 'U' then lesson_id else null end,
  grade,
  graded_at
from latest_grades
where grade in ('U', 'I')
on conflict (enrollment_id, acs_item_id) where resolved_at is null do nothing;

alter table public.lesson_attempt_items enable row level security;
alter table public.remediation_requirements enable row level security;

drop policy if exists "staff_manage_lesson_attempt_items" on public.lesson_attempt_items;
create policy "staff_manage_lesson_attempt_items" on public.lesson_attempt_items
for all to authenticated
using (public.is_portal_staff()) with check (public.is_portal_staff());

drop policy if exists "students_read_own_lesson_attempt_items" on public.lesson_attempt_items;
create policy "students_read_own_lesson_attempt_items" on public.lesson_attempt_items
for select to authenticated
using (exists (
  select 1 from public.lesson_attempts a
  join public.enrollments e on e.id = a.enrollment_id
  where a.id = lesson_attempt_items.lesson_attempt_id and e.student_id = auth.uid()
));

drop policy if exists "staff_manage_remediation_requirements" on public.remediation_requirements;
create policy "staff_manage_remediation_requirements" on public.remediation_requirements
for all to authenticated
using (public.is_portal_staff()) with check (public.is_portal_staff());

drop policy if exists "students_read_own_remediation_requirements" on public.remediation_requirements;
create policy "students_read_own_remediation_requirements" on public.remediation_requirements
for select to authenticated
using (exists (
  select 1 from public.enrollments e
  where e.id = remediation_requirements.enrollment_id and e.student_id = auth.uid()
));

drop policy if exists "published_attempts_student_read" on public.lesson_attempts;
create policy "attempts_student_or_staff_read" on public.lesson_attempts for select to authenticated
using (public.is_portal_staff() or instructor_id = auth.uid() or exists (
  select 1 from public.enrollments e
  where e.id = lesson_attempts.enrollment_id and e.student_id = auth.uid()
));

create or replace function public.require_comment_for_unresolved_grade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.grade in ('U', 'I') and nullif(btrim(new.instructor_comment), '') is null then
    raise exception 'Unsatisfactory and Incomplete grades require an instructor comment.';
  end if;
  return new;
end;
$$;

drop trigger if exists grades_require_unresolved_comment on public.grades;
create trigger grades_require_unresolved_comment
before insert or update on public.grades
for each row execute function public.require_comment_for_unresolved_grade();

create or replace function public.validate_lesson_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    if new.ground_minutes + new.flight_minutes + new.simulator_minutes <= 0 then
      raise exception 'Enter ground, flight, or simulator time before closing the lesson.';
    end if;

    if not exists (select 1 from public.lesson_attempt_items i where i.lesson_attempt_id = new.id) then
      raise exception 'A lesson cannot be closed without ACS line items.';
    end if;

    if exists (
      select 1 from public.lesson_attempt_items i
      left join public.grades g
        on g.lesson_attempt_id = i.lesson_attempt_id and g.acs_item_id = i.acs_item_id
      where i.lesson_attempt_id = new.id and g.id is null
    ) then
      raise exception 'Every ACS line item must be graded before the lesson is closed.';
    end if;

    if exists (
      select 1 from public.grades g
      join public.lesson_attempt_items i
        on i.lesson_attempt_id = g.lesson_attempt_id and i.acs_item_id = g.acs_item_id
      where g.lesson_attempt_id = new.id
        and g.grade in ('U', 'I')
        and nullif(btrim(g.instructor_comment), '') is null
    ) then
      raise exception 'Unsatisfactory and Incomplete grades require an instructor comment.';
    end if;

    new.closed_at := coalesce(new.closed_at, now());
    new.published_at := coalesce(new.published_at, new.closed_at);
    new.training_minutes := new.flight_minutes + new.simulator_minutes;
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_attempts_validate_close on public.lesson_attempts;
create trigger lesson_attempts_validate_close
before update on public.lesson_attempts
for each row execute function public.validate_lesson_close();

create or replace function public.carry_forward_unresolved_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    update public.remediation_requirements r
    set resolved_at = new.closed_at, resolved_by_attempt_id = new.id
    where r.id in (
      select i.remediation_requirement_id
      from public.lesson_attempt_items i
      where i.lesson_attempt_id = new.id and i.remediation_requirement_id is not null
    ) and r.resolved_at is null;

    insert into public.remediation_requirements (
      enrollment_id,
      acs_item_id,
      source_attempt_id,
      required_lesson_id,
      reason,
      opened_at
    )
    select
      new.enrollment_id,
      g.acs_item_id,
      new.id,
      case when g.grade = 'U' then new.lesson_id else null end,
      g.grade,
      new.closed_at
    from public.grades g
    where g.lesson_attempt_id = new.id and g.grade in ('U', 'I')
      and not exists (
        select 1 from public.remediation_requirements r
        where r.enrollment_id = new.enrollment_id
          and r.acs_item_id = g.acs_item_id
          and r.resolved_at is null
      );
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_attempts_carry_forward on public.lesson_attempts;
create trigger lesson_attempts_carry_forward
after update on public.lesson_attempts
for each row execute function public.carry_forward_unresolved_items();

create or replace function public.enforce_lesson_open_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'draft' then
    if exists (
      select 1 from public.lesson_attempts a
      where a.enrollment_id = new.enrollment_id and a.status = 'draft' and a.id <> new.id
    ) then
      raise exception 'This student already has an open lesson.';
    end if;

    if exists (
      select 1 from public.remediation_requirements r
      where r.enrollment_id = new.enrollment_id
        and r.resolved_at is null
        and r.reason = 'U'
        and r.required_lesson_id is distinct from new.lesson_id
    ) then
      raise exception 'An Unsatisfactory result requires the assigned repeat lesson to be opened next.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_attempts_enforce_open on public.lesson_attempts;
create trigger lesson_attempts_enforce_open
before insert on public.lesson_attempts
for each row execute function public.enforce_lesson_open_rules();

create or replace function public.protect_closed_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'Closed lesson records are immutable. Create a new attempt instead.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists lesson_attempts_protect_closed on public.lesson_attempts;
create trigger lesson_attempts_protect_closed
before update or delete on public.lesson_attempts
for each row execute function public.protect_closed_attempt();

create or replace function public.protect_closed_attempt_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attempt_id uuid;
begin
  attempt_id := case when tg_op = 'DELETE' then old.lesson_attempt_id else new.lesson_attempt_id end;
  if exists (select 1 from public.lesson_attempts a where a.id = attempt_id and a.status = 'published') then
    raise exception 'Closed lesson records are immutable. Create a new attempt instead.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists grades_protect_closed_attempt on public.grades;
create trigger grades_protect_closed_attempt
before insert or update or delete on public.grades
for each row execute function public.protect_closed_attempt_child();

drop trigger if exists lesson_attempt_items_protect_closed_attempt on public.lesson_attempt_items;
create trigger lesson_attempt_items_protect_closed_attempt
before insert or update or delete on public.lesson_attempt_items
for each row execute function public.protect_closed_attempt_child();

create or replace function public.prevent_incomplete_enrollment_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if exists (
      select 1 from public.lesson_attempts a
      where a.enrollment_id = new.id and a.status = 'draft'
    ) then
      raise exception 'Close the open lesson before completing the course.';
    end if;

    if exists (
      select 1 from public.remediation_requirements r
      where r.enrollment_id = new.id and r.resolved_at is null
    ) then
      raise exception 'Resolve every Unsatisfactory and Incomplete line item before completing the course.';
    end if;

    if not exists (
      select 1
      from public.phases p
      join public.lessons l on l.phase_id = p.id
      join public.lesson_acs_items lai on lai.lesson_id = l.id
      where p.course_version_id = new.course_version_id
    ) then
      raise exception 'A course cannot be completed until it contains ACS line items.';
    end if;

    if exists (
      select distinct lai.acs_item_id
      from public.phases p
      join public.lessons l on l.phase_id = p.id
      join public.lesson_acs_items lai on lai.lesson_id = l.id
      where p.course_version_id = new.course_version_id
        and coalesce((
          select g.grade::text
          from public.lesson_attempts a
          join public.grades g on g.lesson_attempt_id = a.id
          where a.enrollment_id = new.id
            and a.status = 'published'
            and g.acs_item_id = lai.acs_item_id
          order by coalesce(a.published_at, a.conducted_at) desc, a.attempt_number desc
          limit 1
        ), '') not in ('O', 'G', 'M')
    ) then
      raise exception 'Every course ACS line item must have a current completed grade before completing the course.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enrollments_validate_completion on public.enrollments;
create trigger enrollments_validate_completion
before update on public.enrollments
for each row execute function public.prevent_incomplete_enrollment_completion();

create table if not exists public.training_audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('enrollment', 'lesson_attempt', 'attempt_item', 'grade', 'remediation')),
  entity_id text not null,
  enrollment_id uuid,
  student_id uuid,
  action text not null check (action in ('baseline', 'created', 'updated', 'deleted')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb
);

create index if not exists training_audit_log_enrollment_idx
  on public.training_audit_log(enrollment_id, changed_at desc);
create index if not exists training_audit_log_student_idx
  on public.training_audit_log(student_id, changed_at desc);
create unique index if not exists training_audit_log_baseline_idx
  on public.training_audit_log(entity_type, entity_id)
  where action = 'baseline';

alter table public.training_audit_log enable row level security;

drop policy if exists "training_audit_participants_read" on public.training_audit_log;
create policy "training_audit_participants_read" on public.training_audit_log
for select to authenticated
using (public.is_portal_staff() or student_id = auth.uid());

revoke insert, update, delete on public.training_audit_log from anon, authenticated;
grant select on public.training_audit_log to authenticated;

create or replace function public.prevent_training_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Training history is append-only and cannot be changed or deleted.';
end;
$$;

drop trigger if exists protect_training_audit_log on public.training_audit_log;
create trigger protect_training_audit_log
before update or delete on public.training_audit_log
for each row execute function public.prevent_training_audit_mutation();

insert into public.training_audit_log (entity_type, entity_id, enrollment_id, student_id, action, after_data)
select 'enrollment', e.id::text, e.id, e.student_id, 'baseline', to_jsonb(e)
from public.enrollments e
where not exists (
  select 1 from public.training_audit_log h
  where h.entity_type = 'enrollment' and h.entity_id = e.id::text and h.action = 'baseline'
);

insert into public.training_audit_log (entity_type, entity_id, enrollment_id, student_id, action, after_data)
select 'lesson_attempt', a.id::text, a.enrollment_id, e.student_id, 'baseline', to_jsonb(a)
from public.lesson_attempts a
join public.enrollments e on e.id = a.enrollment_id
where not exists (
  select 1 from public.training_audit_log h
  where h.entity_type = 'lesson_attempt' and h.entity_id = a.id::text and h.action = 'baseline'
);

insert into public.training_audit_log (entity_type, entity_id, enrollment_id, student_id, action, after_data)
select 'attempt_item', i.id::text, a.enrollment_id, e.student_id, 'baseline', to_jsonb(i)
from public.lesson_attempt_items i
join public.lesson_attempts a on a.id = i.lesson_attempt_id
join public.enrollments e on e.id = a.enrollment_id
where not exists (
  select 1 from public.training_audit_log h
  where h.entity_type = 'attempt_item' and h.entity_id = i.id::text and h.action = 'baseline'
);

insert into public.training_audit_log (entity_type, entity_id, enrollment_id, student_id, action, after_data)
select 'grade', g.id::text, a.enrollment_id, e.student_id, 'baseline', to_jsonb(g)
from public.grades g
join public.lesson_attempts a on a.id = g.lesson_attempt_id
join public.enrollments e on e.id = a.enrollment_id
where not exists (
  select 1 from public.training_audit_log h
  where h.entity_type = 'grade' and h.entity_id = g.id::text and h.action = 'baseline'
);

insert into public.training_audit_log (entity_type, entity_id, enrollment_id, student_id, action, after_data)
select 'remediation', r.id::text, r.enrollment_id, e.student_id, 'baseline', to_jsonb(r)
from public.remediation_requirements r
join public.enrollments e on e.id = r.enrollment_id
where not exists (
  select 1 from public.training_audit_log h
  where h.entity_type = 'remediation' and h.entity_id = r.id::text and h.action = 'baseline'
);

create or replace function public.capture_training_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  resolved_enrollment_id uuid;
  resolved_student_id uuid;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  snapshot := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'enrollments' then
    resolved_enrollment_id := (snapshot ->> 'id')::uuid;
    resolved_student_id := (snapshot ->> 'student_id')::uuid;
  elsif tg_table_name = 'lesson_attempts' then
    resolved_enrollment_id := (snapshot ->> 'enrollment_id')::uuid;
  elsif tg_table_name in ('lesson_attempt_items', 'grades') then
    select a.enrollment_id into resolved_enrollment_id
    from public.lesson_attempts a
    where a.id = (snapshot ->> 'lesson_attempt_id')::uuid;
  elsif tg_table_name = 'remediation_requirements' then
    resolved_enrollment_id := (snapshot ->> 'enrollment_id')::uuid;
  end if;

  if resolved_student_id is null then
    select e.student_id into resolved_student_id
    from public.enrollments e
    where e.id = resolved_enrollment_id;
  end if;

  insert into public.training_audit_log (
    entity_type, entity_id, enrollment_id, student_id, action, changed_by, before_data, after_data
  ) values (
    case tg_table_name
      when 'enrollments' then 'enrollment'
      when 'lesson_attempts' then 'lesson_attempt'
      when 'lesson_attempt_items' then 'attempt_item'
      when 'grades' then 'grade'
      when 'remediation_requirements' then 'remediation'
    end,
    snapshot ->> 'id',
    resolved_enrollment_id,
    resolved_student_id,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_training_change() from public;

drop trigger if exists zz_audit_enrollments on public.enrollments;
create trigger zz_audit_enrollments before insert or update or delete on public.enrollments
for each row execute function public.capture_training_change();

drop trigger if exists zz_audit_lesson_attempts on public.lesson_attempts;
create trigger zz_audit_lesson_attempts before insert or update or delete on public.lesson_attempts
for each row execute function public.capture_training_change();

drop trigger if exists zz_audit_lesson_attempt_items on public.lesson_attempt_items;
create trigger zz_audit_lesson_attempt_items before insert or update or delete on public.lesson_attempt_items
for each row execute function public.capture_training_change();

drop trigger if exists zz_audit_grades on public.grades;
create trigger zz_audit_grades before insert or update or delete on public.grades
for each row execute function public.capture_training_change();

drop trigger if exists zz_audit_remediation_requirements on public.remediation_requirements;
create trigger zz_audit_remediation_requirements before insert or update or delete on public.remediation_requirements
for each row execute function public.capture_training_change();
