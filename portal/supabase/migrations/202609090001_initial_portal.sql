create type public.portal_role as enum ('owner', 'instructor', 'student');
create type public.ogmui_grade as enum ('O', 'G', 'M', 'U', 'I');
create type public.attempt_status as enum ('draft', 'published');
create type public.lesson_kind as enum ('flight', 'ground', 'simulator', 'review');
create type public.resource_kind as enum ('document', 'video', 'link');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.portal_role not null default 'student',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.acs_publications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  revision text not null,
  effective_date date,
  created_at timestamptz not null default now()
);

create table public.acs_items (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.acs_publications(id) on delete restrict,
  code text not null,
  area_of_operation text not null,
  task text not null,
  element_type text not null check (element_type in ('knowledge', 'risk_management', 'skill')),
  description text not null,
  sort_order integer not null,
  unique (publication_id, code)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  acs_publication_id uuid not null references public.acs_publications(id) on delete restrict,
  revision integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, revision)
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  course_version_id uuid not null references public.course_versions(id) on delete cascade,
  phase_number integer not null,
  title text not null,
  objective text,
  completion_standard text,
  unique (course_version_id, phase_number)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases(id) on delete cascade,
  lesson_number integer not null,
  title text not null,
  kind public.lesson_kind not null,
  objective text not null,
  completion_standard text not null,
  planned_ground_minutes integer not null default 0 check (planned_ground_minutes >= 0),
  planned_training_minutes integer not null default 0 check (planned_training_minutes >= 0),
  preparation text,
  unique (phase_id, lesson_number)
);

create table public.lesson_acs_items (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  acs_item_id uuid not null references public.acs_items(id) on delete restrict,
  sort_order integer not null,
  primary key (lesson_id, acs_item_id)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  instructor_id uuid not null references public.profiles(id) on delete restrict,
  course_version_id uuid not null references public.course_versions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'completed', 'withdrawn')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  attempt_number integer not null,
  conducted_at timestamptz not null,
  instructor_id uuid not null references public.profiles(id) on delete restrict,
  ground_minutes integer not null default 0 check (ground_minutes >= 0),
  training_minutes integer not null default 0 check (training_minutes >= 0),
  what_worked text,
  what_did_not_work text,
  corrective_action text,
  next_lesson_preparation text,
  status public.attempt_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id, attempt_number)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  lesson_attempt_id uuid not null references public.lesson_attempts(id) on delete cascade,
  acs_item_id uuid not null references public.acs_items(id) on delete restrict,
  grade public.ogmui_grade not null,
  instructor_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_attempt_id, acs_item_id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind public.resource_kind not null,
  description text,
  storage_path text,
  external_url text,
  revision text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((storage_path is not null) <> (external_url is not null))
);

create table public.resource_assignments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  course_version_id uuid references public.course_versions(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  lesson_attempt_id uuid references public.lesson_attempts(id) on delete cascade,
  required boolean not null default false,
  assigned_at timestamptz not null default now(),
  check (num_nonnulls(course_version_id, lesson_id, enrollment_id, lesson_attempt_id) = 1)
);

create table public.resource_views (
  resource_assignment_id uuid not null references public.resource_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (resource_assignment_id, student_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  course_version_id uuid references public.course_versions(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  published_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  check (num_nonnulls(course_version_id, enrollment_id) <= 1)
);

create index enrollments_student_idx on public.enrollments(student_id, status);
create index enrollments_instructor_idx on public.enrollments(instructor_id, status);
create index attempts_enrollment_idx on public.lesson_attempts(enrollment_id, conducted_at desc);
create index grades_item_idx on public.grades(acs_item_id, created_at desc);
create index assignments_enrollment_idx on public.resource_assignments(enrollment_id);

create or replace function public.is_portal_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('owner', 'instructor')
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lesson_attempts_updated_at before update on public.lesson_attempts
for each row execute function public.set_updated_at();
create trigger grades_updated_at before update on public.grades
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.acs_publications enable row level security;
alter table public.acs_items enable row level security;
alter table public.courses enable row level security;
alter table public.course_versions enable row level security;
alter table public.phases enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_acs_items enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_attempts enable row level security;
alter table public.grades enable row level security;
alter table public.resources enable row level security;
alter table public.resource_assignments enable row level security;
alter table public.resource_views enable row level security;
alter table public.announcements enable row level security;

create policy "profiles_self_or_staff_read" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_portal_staff());
create policy "staff_manage_profiles" on public.profiles for all to authenticated
using (public.is_portal_staff()) with check (public.is_portal_staff());

create policy "authenticated_read_acs_publications" on public.acs_publications for select to authenticated using (true);
create policy "authenticated_read_acs_items" on public.acs_items for select to authenticated using (true);
create policy "staff_manage_acs_publications" on public.acs_publications for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "staff_manage_acs_items" on public.acs_items for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());

create policy "authenticated_read_published_courses" on public.courses for select to authenticated using (active or public.is_portal_staff());
create policy "authenticated_read_course_versions" on public.course_versions for select to authenticated
using (public.is_portal_staff() or exists (select 1 from public.enrollments e where e.course_version_id = course_versions.id and e.student_id = auth.uid()));
create policy "authenticated_read_phases" on public.phases for select to authenticated
using (public.is_portal_staff() or exists (select 1 from public.enrollments e where e.course_version_id = phases.course_version_id and e.student_id = auth.uid()));
create policy "authenticated_read_lessons" on public.lessons for select to authenticated
using (public.is_portal_staff() or exists (select 1 from public.phases p join public.enrollments e on e.course_version_id = p.course_version_id where p.id = lessons.phase_id and e.student_id = auth.uid()));
create policy "authenticated_read_lesson_acs" on public.lesson_acs_items for select to authenticated
using (public.is_portal_staff() or exists (select 1 from public.lessons l join public.phases p on p.id = l.phase_id join public.enrollments e on e.course_version_id = p.course_version_id where l.id = lesson_acs_items.lesson_id and e.student_id = auth.uid()));

create policy "staff_manage_courses" on public.courses for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "staff_manage_course_versions" on public.course_versions for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "staff_manage_phases" on public.phases for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "staff_manage_lessons" on public.lessons for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "staff_manage_lesson_acs" on public.lesson_acs_items for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());

create policy "enrollment_participants_read" on public.enrollments for select to authenticated
using (student_id = auth.uid() or instructor_id = auth.uid() or public.is_portal_staff());
create policy "staff_manage_enrollments" on public.enrollments for all to authenticated
using (public.is_portal_staff()) with check (public.is_portal_staff());

create policy "published_attempts_student_read" on public.lesson_attempts for select to authenticated
using (public.is_portal_staff() or instructor_id = auth.uid() or exists (select 1 from public.enrollments e where e.id = lesson_attempts.enrollment_id and e.student_id = auth.uid() and lesson_attempts.status = 'published'));
create policy "staff_manage_attempts" on public.lesson_attempts for all to authenticated
using (public.is_portal_staff()) with check (public.is_portal_staff());

create policy "published_grades_student_read" on public.grades for select to authenticated
using (public.is_portal_staff() or exists (select 1 from public.lesson_attempts a join public.enrollments e on e.id = a.enrollment_id where a.id = grades.lesson_attempt_id and a.status = 'published' and e.student_id = auth.uid()));
create policy "staff_manage_grades" on public.grades for all to authenticated
using (public.is_portal_staff()) with check (public.is_portal_staff());

create policy "staff_manage_resources" on public.resources for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "assigned_resources_read" on public.resources for select to authenticated
using (public.is_portal_staff() or exists (
  select 1 from public.resource_assignments ra
  left join public.enrollments direct_e on direct_e.id = ra.enrollment_id
  left join public.lesson_attempts la on la.id = ra.lesson_attempt_id
  left join public.enrollments attempt_e on attempt_e.id = la.enrollment_id
  left join public.lessons lesson on lesson.id = ra.lesson_id
  left join public.phases phase on phase.id = lesson.phase_id
  left join public.enrollments lesson_e on lesson_e.course_version_id = phase.course_version_id
  left join public.enrollments course_e on course_e.course_version_id = ra.course_version_id
  where ra.resource_id = resources.id and auth.uid() in (direct_e.student_id, attempt_e.student_id, lesson_e.student_id, course_e.student_id)
));
create policy "staff_manage_resource_assignments" on public.resource_assignments for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "student_read_resource_assignments" on public.resource_assignments for select to authenticated
using (public.is_portal_staff() or exists (
  select 1 from public.enrollments e
  left join public.lesson_attempts la on la.enrollment_id = e.id
  left join public.lessons l on l.phase_id in (select p.id from public.phases p where p.course_version_id = e.course_version_id)
  where e.student_id = auth.uid() and (resource_assignments.enrollment_id = e.id or resource_assignments.lesson_attempt_id = la.id or resource_assignments.lesson_id = l.id or resource_assignments.course_version_id = e.course_version_id)
));
create policy "student_manage_own_resource_views" on public.resource_views for all to authenticated
using (student_id = auth.uid() or public.is_portal_staff()) with check (student_id = auth.uid() or public.is_portal_staff());

create policy "staff_manage_announcements" on public.announcements for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "student_read_announcements" on public.announcements for select to authenticated
using (public.is_portal_staff() or (
  announcements.enrollment_id is null and announcements.course_version_id is null
) or exists (
  select 1 from public.enrollments e where e.student_id = auth.uid() and (e.id = announcements.enrollment_id or e.course_version_id = announcements.course_version_id)
));

insert into storage.buckets (id, name, public)
values ('training-resources', 'training-resources', false)
on conflict (id) do nothing;

create policy "staff_upload_training_resources" on storage.objects for insert to authenticated
with check (bucket_id = 'training-resources' and public.is_portal_staff());
create policy "staff_manage_training_resources" on storage.objects for update to authenticated
using (bucket_id = 'training-resources' and public.is_portal_staff())
with check (bucket_id = 'training-resources' and public.is_portal_staff());
create policy "staff_delete_training_resources" on storage.objects for delete to authenticated
using (bucket_id = 'training-resources' and public.is_portal_staff());
create policy "authenticated_read_training_resources" on storage.objects for select to authenticated
using (bucket_id = 'training-resources' and exists (
  select 1 from public.resources r where r.storage_path = name and (
    public.is_portal_staff() or exists (
      select 1 from public.resource_assignments ra
      left join public.enrollments direct_e on direct_e.id = ra.enrollment_id
      left join public.lesson_attempts la on la.id = ra.lesson_attempt_id
      left join public.enrollments attempt_e on attempt_e.id = la.enrollment_id
      left join public.lessons lesson on lesson.id = ra.lesson_id
      left join public.phases phase on phase.id = lesson.phase_id
      left join public.enrollments lesson_e on lesson_e.course_version_id = phase.course_version_id
      left join public.enrollments course_e on course_e.course_version_id = ra.course_version_id
      where ra.resource_id = r.id and auth.uid() in (direct_e.student_id, attempt_e.student_id, lesson_e.student_id, course_e.student_id)
    )
  )
));
