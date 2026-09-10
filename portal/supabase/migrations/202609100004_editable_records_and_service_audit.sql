-- Permit authorized corrections while preserving every prior value in the append-only audit logs.

alter table public.training_audit_log
  drop constraint if exists training_audit_log_entity_type_check;
alter table public.training_audit_log
  add constraint training_audit_log_entity_type_check check (
    entity_type in ('enrollment', 'lesson_attempt', 'attempt_item', 'grade', 'remediation', 'profile', 'resource', 'resource_assignment')
  );

alter table public.course_change_log
  drop constraint if exists course_change_log_entity_type_check;
alter table public.course_change_log
  add constraint course_change_log_entity_type_check check (
    entity_type in ('course', 'course_version', 'phase', 'lesson', 'lesson_acs_item', 'acs_publication', 'acs_item')
  );

create or replace function public.guard_closed_attempt_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.status = 'published' then
    raise exception 'Closed lesson records cannot be deleted; correct the record instead.';
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    if new.status <> 'published'
      or new.id <> old.id
      or new.enrollment_id <> old.enrollment_id
      or new.lesson_id <> old.lesson_id
      or new.attempt_number <> old.attempt_number
      or new.instructor_id <> old.instructor_id then
      raise exception 'A closed lesson may be corrected, but its identity and closed status cannot change.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists lesson_attempts_protect_closed on public.lesson_attempts;
create trigger lesson_attempts_protect_closed
before update or delete on public.lesson_attempts
for each row execute function public.guard_closed_attempt_correction();

create or replace function public.guard_closed_grade_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.lesson_attempts a
    where a.id = old.lesson_attempt_id and a.status = 'published'
  ) then
    if tg_op = 'DELETE' then
      raise exception 'Grades on a closed lesson cannot be deleted; correct the grade instead.';
    end if;
    if new.lesson_attempt_id <> old.lesson_attempt_id or new.acs_item_id <> old.acs_item_id then
      raise exception 'The ACS identity of a closed grade cannot be changed.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists grades_protect_closed_attempt on public.grades;
create trigger grades_protect_closed_attempt
before update or delete on public.grades
for each row execute function public.guard_closed_grade_correction();

create or replace function public.sync_corrected_grade_remediation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt_id uuid;
  target_enrollment_id uuid;
  target_item_id uuid;
  attempt_status public.attempt_status;
  latest_grade public.ogmui_grade;
  latest_attempt_id uuid;
  latest_lesson_id uuid;
begin
  target_attempt_id := case when tg_op = 'DELETE' then old.lesson_attempt_id else new.lesson_attempt_id end;
  target_item_id := case when tg_op = 'DELETE' then old.acs_item_id else new.acs_item_id end;

  select a.enrollment_id, a.status into target_enrollment_id, attempt_status
  from public.lesson_attempts a where a.id = target_attempt_id;
  if attempt_status <> 'published' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select g.grade, a.id, a.lesson_id
  into latest_grade, latest_attempt_id, latest_lesson_id
  from public.lesson_attempts a
  join public.grades g on g.lesson_attempt_id = a.id
  where a.enrollment_id = target_enrollment_id
    and a.status = 'published'
    and g.acs_item_id = target_item_id
  order by coalesce(a.closed_at, a.published_at, a.conducted_at) desc, a.attempt_number desc
  limit 1;

  if latest_grade in ('U', 'I') then
    update public.remediation_requirements
    set source_attempt_id = latest_attempt_id,
        required_lesson_id = case when latest_grade = 'U' then latest_lesson_id else null end,
        reason = latest_grade,
        resolved_at = null,
        resolved_by_attempt_id = null
    where enrollment_id = target_enrollment_id and acs_item_id = target_item_id and resolved_at is null;
    if not found then
      insert into public.remediation_requirements (
        enrollment_id, acs_item_id, source_attempt_id, required_lesson_id, reason
      ) values (
        target_enrollment_id, target_item_id, latest_attempt_id,
        case when latest_grade = 'U' then latest_lesson_id else null end,
        latest_grade
      );
    end if;
  else
    update public.remediation_requirements
    set resolved_at = now(), resolved_by_attempt_id = latest_attempt_id
    where enrollment_id = target_enrollment_id and acs_item_id = target_item_id and resolved_at is null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists grades_sync_corrected_remediation on public.grades;
create trigger grades_sync_corrected_remediation
after insert or update or delete on public.grades
for each row execute function public.sync_corrected_grade_remediation();

create or replace function public.capture_service_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  resolved_enrollment_id uuid;
  resolved_student_id uuid;
  resolved_type text;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  snapshot := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'profiles' then
    resolved_type := 'profile';
    resolved_student_id := (snapshot ->> 'id')::uuid;
  elsif tg_table_name = 'resources' then
    resolved_type := 'resource';
  else
    resolved_type := 'resource_assignment';
    if snapshot ->> 'enrollment_id' is not null then
      resolved_enrollment_id := (snapshot ->> 'enrollment_id')::uuid;
    elsif snapshot ->> 'lesson_attempt_id' is not null then
      select a.enrollment_id into resolved_enrollment_id
      from public.lesson_attempts a where a.id = (snapshot ->> 'lesson_attempt_id')::uuid;
    end if;
    if resolved_enrollment_id is not null then
      select e.student_id into resolved_student_id from public.enrollments e where e.id = resolved_enrollment_id;
    end if;
  end if;

  insert into public.training_audit_log (
    entity_type, entity_id, enrollment_id, student_id, action, changed_by, before_data, after_data
  ) values (
    resolved_type, snapshot ->> 'id', resolved_enrollment_id, resolved_student_id,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists zz_audit_profiles on public.profiles;
create trigger zz_audit_profiles before insert or update or delete on public.profiles
for each row execute function public.capture_service_change();
drop trigger if exists zz_audit_resources on public.resources;
create trigger zz_audit_resources before insert or update or delete on public.resources
for each row execute function public.capture_service_change();
drop trigger if exists zz_audit_resource_assignments on public.resource_assignments;
create trigger zz_audit_resource_assignments before insert or update or delete on public.resource_assignments
for each row execute function public.capture_service_change();

insert into public.training_audit_log (entity_type, entity_id, student_id, action, after_data)
select 'profile', p.id::text, p.id, 'baseline', to_jsonb(p)
from public.profiles p
where not exists (select 1 from public.training_audit_log h where h.entity_type = 'profile' and h.entity_id = p.id::text and h.action = 'baseline');

insert into public.training_audit_log (entity_type, entity_id, action, after_data)
select 'resource', r.id::text, 'baseline', to_jsonb(r)
from public.resources r
where not exists (select 1 from public.training_audit_log h where h.entity_type = 'resource' and h.entity_id = r.id::text and h.action = 'baseline');

create or replace function public.capture_acs_course_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  resolved_course_id uuid;
  resolved_version_id uuid;
  resolved_type text;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  snapshot := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resolved_type := case when tg_table_name = 'acs_publications' then 'acs_publication' else 'acs_item' end;

  if tg_table_name = 'acs_publications' then
    select v.course_id, v.id into resolved_course_id, resolved_version_id
    from public.course_versions v where v.acs_publication_id = (snapshot ->> 'id')::uuid
    order by v.revision desc limit 1;
  else
    select v.course_id, v.id into resolved_course_id, resolved_version_id
    from public.lesson_acs_items m
    join public.lessons l on l.id = m.lesson_id
    join public.phases p on p.id = l.phase_id
    join public.course_versions v on v.id = p.course_version_id
    where m.acs_item_id = (snapshot ->> 'id')::uuid
    order by v.revision desc limit 1;
  end if;

  insert into public.course_change_log (
    entity_type, entity_id, course_id, course_version_id, action, changed_by, before_data, after_data
  ) values (
    resolved_type, snapshot ->> 'id', resolved_course_id, resolved_version_id,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_acs_publications on public.acs_publications;
create trigger audit_acs_publications before insert or update or delete on public.acs_publications
for each row execute function public.capture_acs_course_change();
drop trigger if exists audit_acs_items on public.acs_items;
create trigger audit_acs_items before insert or update or delete on public.acs_items
for each row execute function public.capture_acs_course_change();
