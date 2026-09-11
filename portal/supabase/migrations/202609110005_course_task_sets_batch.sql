-- Course-scoped ACS Task sets and the September 11 batch:
--   Commercial Pilot ASEL, Commercial Pilot AMEL Add-On,
--   Flight Instructor ASEL, and Flight Instructor AMEL Add-On (MEI).
-- Run this file once as a single Supabase SQL Editor call. It is idempotent.

create table if not exists public.acs_task_sets (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.acs_publications(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (publication_id, code),
  unique (id, publication_id)
);

create table if not exists public.acs_task_set_items (
  task_set_id uuid not null references public.acs_task_sets(id) on delete cascade,
  acs_item_id uuid not null references public.acs_items(id) on delete cascade,
  sort_order integer not null,
  primary key (task_set_id, acs_item_id)
);

alter table public.course_versions
  add column if not exists acs_task_set_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'course_versions_task_set_publication_fk') then
    alter table public.course_versions
      add constraint course_versions_task_set_publication_fk
      foreign key (acs_task_set_id, acs_publication_id)
      references public.acs_task_sets(id, publication_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists acs_task_sets_publication_idx on public.acs_task_sets(publication_id);
create index if not exists acs_task_set_items_item_idx on public.acs_task_set_items(acs_item_id);

alter table public.acs_task_sets enable row level security;
alter table public.acs_task_set_items enable row level security;

drop policy if exists "authenticated_read_acs_task_sets" on public.acs_task_sets;
create policy "authenticated_read_acs_task_sets" on public.acs_task_sets
for select to authenticated using (true);

drop policy if exists "staff_manage_acs_task_sets" on public.acs_task_sets;
create policy "staff_manage_acs_task_sets" on public.acs_task_sets
for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());

drop policy if exists "authenticated_read_acs_task_set_items" on public.acs_task_set_items;
create policy "authenticated_read_acs_task_set_items" on public.acs_task_set_items
for select to authenticated using (true);

drop policy if exists "staff_manage_acs_task_set_items" on public.acs_task_set_items;
create policy "staff_manage_acs_task_set_items" on public.acs_task_set_items
for all to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());

insert into public.acs_publications (code, title, revision)
values
  ('FAA-S-ACS-7B', 'Commercial Pilot for Airplane Category Airman Certification Standards', '7B'),
  ('FAA-S-ACS-25', 'Flight Instructor for Airplane Category Airman Certification Standards', '25')
on conflict (code) do update
set title = excluded.title,
    revision = excluded.revision;

create temporary table portal_acs_item_seed (
  publication_code text not null,
  item_code text not null,
  area_of_operation text not null,
  task text not null,
  sort_order integer not null,
  primary key (publication_code, item_code)
) on commit drop;

insert into portal_acs_item_seed values
  ('FAA-S-ACS-7B','CAX-I-A','I. Preflight Preparation','A. Pilot Qualifications',101),
  ('FAA-S-ACS-7B','CAX-I-B','I. Preflight Preparation','B. Airworthiness Requirements',102),
  ('FAA-S-ACS-7B','CAX-I-C','I. Preflight Preparation','C. Weather Information',103),
  ('FAA-S-ACS-7B','CAX-I-D','I. Preflight Preparation','D. Cross-Country Flight Planning',104),
  ('FAA-S-ACS-7B','CAX-I-E','I. Preflight Preparation','E. National Airspace System',105),
  ('FAA-S-ACS-7B','CAX-I-F','I. Preflight Preparation','F. Performance and Limitations',106),
  ('FAA-S-ACS-7B','CAX-I-G','I. Preflight Preparation','G. Operation of Systems',107),
  ('FAA-S-ACS-7B','CAX-I-H','I. Preflight Preparation','H. Human Factors',108),
  ('FAA-S-ACS-7B','CAX-II-A','II. Preflight Procedures','A. Preflight Assessment',201),
  ('FAA-S-ACS-7B','CAX-II-B','II. Preflight Procedures','B. Flight Deck Management',202),
  ('FAA-S-ACS-7B','CAX-II-C','II. Preflight Procedures','C. Engine Starting',203),
  ('FAA-S-ACS-7B','CAX-II-D','II. Preflight Procedures','D. Taxiing (ASEL, AMEL)',204),
  ('FAA-S-ACS-7B','CAX-II-F','II. Preflight Procedures','F. Before Takeoff Check',206),
  ('FAA-S-ACS-7B','CAX-III-A','III. Airport and Seaplane Base Operations','A. Communications, Light Signals, and Runway Lighting Systems',301),
  ('FAA-S-ACS-7B','CAX-III-B','III. Airport and Seaplane Base Operations','B. Traffic Patterns',302),
  ('FAA-S-ACS-7B','CAX-IV-A','IV. Takeoffs, Landings, and Go-Arounds','A. Normal Takeoff and Climb',401),
  ('FAA-S-ACS-7B','CAX-IV-B','IV. Takeoffs, Landings, and Go-Arounds','B. Normal Approach and Landing',402),
  ('FAA-S-ACS-7B','CAX-IV-C','IV. Takeoffs, Landings, and Go-Arounds','C. Soft-Field Takeoff and Climb (ASEL)',403),
  ('FAA-S-ACS-7B','CAX-IV-D','IV. Takeoffs, Landings, and Go-Arounds','D. Soft-Field Approach and Landing (ASEL)',404),
  ('FAA-S-ACS-7B','CAX-IV-E','IV. Takeoffs, Landings, and Go-Arounds','E. Short-Field Takeoff and Maximum Performance Climb (ASEL, AMEL)',405),
  ('FAA-S-ACS-7B','CAX-IV-F','IV. Takeoffs, Landings, and Go-Arounds','F. Short-Field Approach and Landing (ASEL, AMEL)',406),
  ('FAA-S-ACS-7B','CAX-IV-M','IV. Takeoffs, Landings, and Go-Arounds','M. Power-Off 180° Accuracy Approach and Landing (ASEL, ASES)',413),
  ('FAA-S-ACS-7B','CAX-IV-N','IV. Takeoffs, Landings, and Go-Arounds','N. Go-Around/Rejected Landing',414),
  ('FAA-S-ACS-7B','CAX-V-A','V. Performance Maneuvers and Ground Reference Maneuvers','A. Steep Turns',501),
  ('FAA-S-ACS-7B','CAX-V-B','V. Performance Maneuvers and Ground Reference Maneuvers','B. Steep Spiral (ASEL, ASES)',502),
  ('FAA-S-ACS-7B','CAX-V-C','V. Performance Maneuvers and Ground Reference Maneuvers','C. Chandelles (ASEL, ASES)',503),
  ('FAA-S-ACS-7B','CAX-V-D','V. Performance Maneuvers and Ground Reference Maneuvers','D. Lazy Eights (ASEL, ASES)',504),
  ('FAA-S-ACS-7B','CAX-V-E','V. Performance Maneuvers and Ground Reference Maneuvers','E. Eights on Pylons (ASEL, ASES)',505),
  ('FAA-S-ACS-7B','CAX-VI-A','VI. Navigation','A. Pilotage and Dead Reckoning',601),
  ('FAA-S-ACS-7B','CAX-VI-B','VI. Navigation','B. Navigation Systems and Radar Services',602),
  ('FAA-S-ACS-7B','CAX-VI-C','VI. Navigation','C. Diversion',603),
  ('FAA-S-ACS-7B','CAX-VI-D','VI. Navigation','D. Lost Procedures',604),
  ('FAA-S-ACS-7B','CAX-VII-A','VII. Slow Flight and Stalls','A. Maneuvering During Slow Flight',701),
  ('FAA-S-ACS-7B','CAX-VII-B','VII. Slow Flight and Stalls','B. Power-Off Stalls',702),
  ('FAA-S-ACS-7B','CAX-VII-C','VII. Slow Flight and Stalls','C. Power-On Stalls',703),
  ('FAA-S-ACS-7B','CAX-VII-D','VII. Slow Flight and Stalls','D. Accelerated Stalls',704),
  ('FAA-S-ACS-7B','CAX-VII-E','VII. Slow Flight and Stalls','E. Spin Awareness',705),
  ('FAA-S-ACS-7B','CAX-VIII-A','VIII. High-Altitude Operations','A. Supplemental Oxygen',801),
  ('FAA-S-ACS-7B','CAX-VIII-B','VIII. High-Altitude Operations','B. Pressurization',802),
  ('FAA-S-ACS-7B','CAX-IX-A','IX. Emergency Operations','A. Emergency Descent',901),
  ('FAA-S-ACS-7B','CAX-IX-B','IX. Emergency Operations','B. Emergency Approach and Landing (Simulated) (ASEL, ASES)',902),
  ('FAA-S-ACS-7B','CAX-IX-C','IX. Emergency Operations','C. Systems and Equipment Malfunctions',903),
  ('FAA-S-ACS-7B','CAX-IX-D','IX. Emergency Operations','D. Emergency Equipment and Survival Gear',904),
  ('FAA-S-ACS-7B','CAX-IX-E','IX. Emergency Operations','E. Engine Failure During Takeoff Before VMC (Simulated) (AMEL, AMES)',905),
  ('FAA-S-ACS-7B','CAX-IX-F','IX. Emergency Operations','F. Engine Failure After Liftoff (Simulated) (AMEL, AMES)',906),
  ('FAA-S-ACS-7B','CAX-IX-G','IX. Emergency Operations','G. Approach and Landing with an Inoperative Engine (Simulated) (AMEL, AMES)',907),
  ('FAA-S-ACS-7B','CAX-X-A','X. Multiengine Operations','A. Maneuvering with One Engine Inoperative (AMEL, AMES)',1001),
  ('FAA-S-ACS-7B','CAX-X-B','X. Multiengine Operations','B. VMC Demonstration (AMEL, AMES)',1002),
  ('FAA-S-ACS-7B','CAX-X-C','X. Multiengine Operations','C. One Engine Inoperative (Simulated) (solely by Reference to Instruments) During Straight-and-Level Flight and Turns (AMEL, AMES)',1003),
  ('FAA-S-ACS-7B','CAX-X-D','X. Multiengine Operations','D. Instrument Approach and Landing with an Inoperative Engine (Simulated) (AMEL, AMES)',1004),
  ('FAA-S-ACS-7B','CAX-XI-A','XI. Postflight Procedures','A. After Landing, Parking, and Securing (ASEL, AMEL)',1101),
  ('FAA-S-ACS-25','CFI-I-A','I. Fundamentals of Instructing','A. Effects of Human Behavior and Communication on the Learning Process',101),
  ('FAA-S-ACS-25','CFI-I-B','I. Fundamentals of Instructing','B. Learning Process',102),
  ('FAA-S-ACS-25','CFI-I-C','I. Fundamentals of Instructing','C. Course Development, Lesson Plans, and Classroom Training Techniques',103),
  ('FAA-S-ACS-25','CFI-I-D','I. Fundamentals of Instructing','D. Student Evaluation, Assessment, and Testing',104),
  ('FAA-S-ACS-25','CFI-I-E','I. Fundamentals of Instructing','E. Elements of Effective Teaching in a Professional Environment',105),
  ('FAA-S-ACS-25','CFI-I-F','I. Fundamentals of Instructing','F. Elements of Effective Teaching that Include Risk Management and Accident Prevention',106),
  ('FAA-S-ACS-25','CFI-II-A','II. Technical Subject Areas','A. Human Factors',201),
  ('FAA-S-ACS-25','CFI-II-B','II. Technical Subject Areas','B. Visual Scanning and Collision Avoidance',202),
  ('FAA-S-ACS-25','CFI-II-C','II. Technical Subject Areas','C. Runway Incursion Avoidance',203),
  ('FAA-S-ACS-25','CFI-II-D','II. Technical Subject Areas','D. Principles of Flight',204),
  ('FAA-S-ACS-25','CFI-II-E','II. Technical Subject Areas','E. Aircraft Flight Controls and Operation of Systems',205),
  ('FAA-S-ACS-25','CFI-II-F','II. Technical Subject Areas','F. Performance and Limitations',206),
  ('FAA-S-ACS-25','CFI-II-G','II. Technical Subject Areas','G. National Airspace System',207),
  ('FAA-S-ACS-25','CFI-II-H','II. Technical Subject Areas','H. Navigation Systems and Radar Services',208),
  ('FAA-S-ACS-25','CFI-II-I','II. Technical Subject Areas','I. Navigation and Cross-Country Flight Planning',209),
  ('FAA-S-ACS-25','CFI-II-J','II. Technical Subject Areas','J. 14 CFR and Publications',210),
  ('FAA-S-ACS-25','CFI-II-K','II. Technical Subject Areas','K. Endorsements and Logbook Entries',211),
  ('FAA-S-ACS-25','CFI-II-M','II. Technical Subject Areas','M. Night Operations',213),
  ('FAA-S-ACS-25','CFI-II-N','II. Technical Subject Areas','N. High Altitude Operations - Supplemental Oxygen',214),
  ('FAA-S-ACS-25','CFI-II-O','II. Technical Subject Areas','O. High Altitude Operations - Pressurization',215),
  ('FAA-S-ACS-25','CFI-II-P','II. Technical Subject Areas','P. One Engine Inoperative (OEI) Performance (AMEL, AMES)',216),
  ('FAA-S-ACS-25','CFI-III-A','III. Preflight Preparation','A. Pilot Qualifications',301),
  ('FAA-S-ACS-25','CFI-III-B','III. Preflight Preparation','B. Airworthiness Requirements',302),
  ('FAA-S-ACS-25','CFI-III-C','III. Preflight Preparation','C. Weather Information',303),
  ('FAA-S-ACS-25','CFI-IV-A','IV. Preflight Lesson on a Maneuver to be Performed in Flight','A. Maneuver Lesson',401),
  ('FAA-S-ACS-25','CFI-V-A','V. Preflight Procedures','A. Preflight Assessment',501),
  ('FAA-S-ACS-25','CFI-V-B','V. Preflight Procedures','B. Flight Deck Management',502),
  ('FAA-S-ACS-25','CFI-V-C','V. Preflight Procedures','C. Engine Starting',503),
  ('FAA-S-ACS-25','CFI-V-D','V. Preflight Procedures','D. Taxiing, Airport Signs, and Lighting (ASEL, AMEL)',504),
  ('FAA-S-ACS-25','CFI-V-F','V. Preflight Procedures','F. Before Takeoff Check',506),
  ('FAA-S-ACS-25','CFI-VI-A','VI. Airport and Seaplane Base Operations','A. Communications, Light Signals, and Runway Lighting Systems',601),
  ('FAA-S-ACS-25','CFI-VI-B','VI. Airport and Seaplane Base Operations','B. Traffic Patterns',602),
  ('FAA-S-ACS-25','CFI-VII-A','VII. Takeoffs, Landings, and Go-Arounds','A. Normal Takeoff and Climb',701),
  ('FAA-S-ACS-25','CFI-VII-B','VII. Takeoffs, Landings, and Go-Arounds','B. Normal Approach and Landing',702),
  ('FAA-S-ACS-25','CFI-VII-C','VII. Takeoffs, Landings, and Go-Arounds','C. Soft-Field Takeoff and Climb (ASEL)',703),
  ('FAA-S-ACS-25','CFI-VII-D','VII. Takeoffs, Landings, and Go-Arounds','D. Soft-Field Approach and Landing (ASEL)',704),
  ('FAA-S-ACS-25','CFI-VII-E','VII. Takeoffs, Landings, and Go-Arounds','E. Short-Field Takeoff and Maximum Performance Climb (ASEL, AMEL)',705),
  ('FAA-S-ACS-25','CFI-VII-F','VII. Takeoffs, Landings, and Go-Arounds','F. Short-Field Approach and Landing (ASEL, AMEL)',706),
  ('FAA-S-ACS-25','CFI-VII-M','VII. Takeoffs, Landings, and Go-Arounds','M. Slip to a Landing (ASEL, ASES)',713),
  ('FAA-S-ACS-25','CFI-VII-N','VII. Takeoffs, Landings, and Go-Arounds','N. Go-Around/Rejected Landing',714),
  ('FAA-S-ACS-25','CFI-VII-O','VII. Takeoffs, Landings, and Go-Arounds','O. Power-Off 180° Accuracy Approach and Landing (ASEL, ASES)',715),
  ('FAA-S-ACS-25','CFI-VIII-A','VIII. Fundamentals of Flight','A. Straight-and-Level Flight',801),
  ('FAA-S-ACS-25','CFI-VIII-B','VIII. Fundamentals of Flight','B. Level Turns',802),
  ('FAA-S-ACS-25','CFI-VIII-C','VIII. Fundamentals of Flight','C. Straight Climbs and Climbing Turns',803),
  ('FAA-S-ACS-25','CFI-VIII-D','VIII. Fundamentals of Flight','D. Straight Descents and Descending Turns',804),
  ('FAA-S-ACS-25','CFI-IX-A','IX. Performance and Ground Reference Maneuvers','A. Steep Turns',901),
  ('FAA-S-ACS-25','CFI-IX-B','IX. Performance and Ground Reference Maneuvers','B. Steep Spiral (ASEL, ASES)',902),
  ('FAA-S-ACS-25','CFI-IX-C','IX. Performance and Ground Reference Maneuvers','C. Chandelles (ASEL, ASES)',903),
  ('FAA-S-ACS-25','CFI-IX-D','IX. Performance and Ground Reference Maneuvers','D. Lazy Eights (ASEL, ASES)',904),
  ('FAA-S-ACS-25','CFI-IX-E','IX. Performance and Ground Reference Maneuvers','E. Ground Reference Maneuvers',905),
  ('FAA-S-ACS-25','CFI-IX-F','IX. Performance and Ground Reference Maneuvers','F. Eights on Pylons (ASEL, ASES)',906),
  ('FAA-S-ACS-25','CFI-X-A','X. Slow Flight, Stalls, and Spins','A. Maneuvering During Slow Flight',1001),
  ('FAA-S-ACS-25','CFI-X-B','X. Slow Flight, Stalls, and Spins','B. Demonstration of Flight Characteristics at Various Configurations and Airspeeds (ASEL and ASES)',1002),
  ('FAA-S-ACS-25','CFI-X-C','X. Slow Flight, Stalls, and Spins','C. Power-Off Stalls',1003),
  ('FAA-S-ACS-25','CFI-X-D','X. Slow Flight, Stalls, and Spins','D. Power-On Stalls',1004),
  ('FAA-S-ACS-25','CFI-X-E','X. Slow Flight, Stalls, and Spins','E. Accelerated Stalls',1005),
  ('FAA-S-ACS-25','CFI-X-F','X. Slow Flight, Stalls, and Spins','F. Cross-Controlled Stall Demonstration (ASEL, ASES)',1006),
  ('FAA-S-ACS-25','CFI-X-G','X. Slow Flight, Stalls, and Spins','G. Elevator Trim Stall Demonstration (ASEL, ASES)',1007),
  ('FAA-S-ACS-25','CFI-X-H','X. Slow Flight, Stalls, and Spins','H. Secondary Stall Demonstration (ASEL, ASES)',1008),
  ('FAA-S-ACS-25','CFI-X-I','X. Slow Flight, Stalls, and Spins','I. Spin Awareness and Spins',1009),
  ('FAA-S-ACS-25','CFI-XI-A','XI. Basic Instrument Maneuvers','A. Straight-and-Level Flight',1101),
  ('FAA-S-ACS-25','CFI-XI-B','XI. Basic Instrument Maneuvers','B. Constant Airspeed Climbs',1102),
  ('FAA-S-ACS-25','CFI-XI-C','XI. Basic Instrument Maneuvers','C. Constant Airspeed Descents',1103),
  ('FAA-S-ACS-25','CFI-XI-D','XI. Basic Instrument Maneuvers','D. Turns to Headings',1104),
  ('FAA-S-ACS-25','CFI-XI-E','XI. Basic Instrument Maneuvers','E. Recovery from Unusual Flight Attitudes',1105),
  ('FAA-S-ACS-25','CFI-XII-A','XII. Emergency Operations','A. Emergency Descent',1201),
  ('FAA-S-ACS-25','CFI-XII-B','XII. Emergency Operations','B. Emergency Approach and Landing (Simulated) (ASEL, ASES)',1202),
  ('FAA-S-ACS-25','CFI-XII-C','XII. Emergency Operations','C. Systems and Equipment Malfunctions',1203),
  ('FAA-S-ACS-25','CFI-XII-D','XII. Emergency Operations','D. Emergency Equipment and Survival Gear',1204),
  ('FAA-S-ACS-25','CFI-XII-E','XII. Emergency Operations','E. Engine Failure During Takeoff Before VMC (Simulated) (AMEL, AMES)',1205),
  ('FAA-S-ACS-25','CFI-XII-F','XII. Emergency Operations','F. Engine Failure After Liftoff (Simulated) (AMEL, AMES)',1206),
  ('FAA-S-ACS-25','CFI-XII-G','XII. Emergency Operations','G. Approach and Landing with an Inoperative Engine (Simulated) (AMEL, AMES)',1207),
  ('FAA-S-ACS-25','CFI-XIII-A','XIII. Multiengine Operations','A. Maneuvering with One Engine Inoperative (AMEL, AMES)',1301),
  ('FAA-S-ACS-25','CFI-XIII-B','XIII. Multiengine Operations','B. VMC Demonstration (AMEL, AMES)',1302),
  ('FAA-S-ACS-25','CFI-XIII-C','XIII. Multiengine Operations','C. Demonstration of Effects of Various Airspeeds and Configurations during Engine Inoperative Performance (AMEL and AMES)',1303),
  ('FAA-S-ACS-25','CFI-XIV-A','XIV. Postflight Procedures','A. After Landing, Parking, and Securing (ASEL, AMEL)',1401);

do $$
declare
  seed record;
  target_publication_id uuid;
  matching_item_id uuid;
begin
  for seed in select * from portal_acs_item_seed order by publication_code, sort_order loop
    select id into target_publication_id from public.acs_publications where code = seed.publication_code;
    select id into matching_item_id
    from public.acs_items
    where acs_items.publication_id = target_publication_id
      and lower(btrim(area_of_operation)) = lower(btrim(seed.area_of_operation))
      and lower(btrim(task)) = lower(btrim(seed.task))
    order by sort_order, id limit 1;

    if matching_item_id is null then
      insert into public.acs_items (publication_id, code, area_of_operation, task, element_type, description, sort_order)
      values (target_publication_id, seed.item_code, seed.area_of_operation, seed.task, 'skill', seed.task, seed.sort_order)
      on conflict (publication_id, code) do update
      set area_of_operation = excluded.area_of_operation,
          task = excluded.task,
          element_type = excluded.element_type,
          description = excluded.description,
          sort_order = excluded.sort_order;
    else
      update public.acs_items
      set area_of_operation = seed.area_of_operation,
          task = seed.task,
          description = seed.task,
          sort_order = seed.sort_order
      where id = matching_item_id;
    end if;
    matching_item_id := null;
  end loop;
end
$$;

create temporary table portal_acs_task_set_seed (
  publication_code text not null,
  task_set_code text not null,
  name text not null,
  description text,
  primary key (publication_code, task_set_code)
) on commit drop;

insert into portal_acs_task_set_seed values
  ('FAA-S-ACS-7B','commercial-asel','Commercial Pilot — ASEL','Tasks applicable to an initial Commercial Pilot Airplane Single-Engine Land course.'),
  ('FAA-S-ACS-7B','commercial-amel-add-on','Commercial Pilot — AMEL Add-On','Tasks required when adding AMEL to an existing Commercial ASEL certificate.'),
  ('FAA-S-ACS-25','cfi-asel','Flight Instructor — ASEL','Flight Instructor Airplane Tasks applicable to an ASEL course.'),
  ('FAA-S-ACS-25','mei-add-on','Flight Instructor — AMEL Add-On (MEI)','Flight Instructor Airplane Tasks selected for an AMEL add-on course.');

insert into public.acs_task_sets (publication_id, code, name, description)
select p.id, seed.task_set_code, seed.name, seed.description
from portal_acs_task_set_seed seed
join public.acs_publications p on p.code = seed.publication_code
on conflict (publication_id, code) do update
set name = excluded.name,
    description = excluded.description;

create temporary table portal_acs_task_set_membership (
  publication_code text not null,
  task_set_code text not null,
  item_code text not null,
  sort_order integer not null,
  primary key (publication_code, task_set_code, item_code)
) on commit drop;

insert into portal_acs_task_set_membership
select batch.publication_code, batch.task_set_code, item_code, ordinality::integer
from (values
  ('FAA-S-ACS-7B','commercial-asel',array[
    'CAX-I-A','CAX-I-B','CAX-I-C','CAX-I-D','CAX-I-E','CAX-I-F','CAX-I-G','CAX-I-H',
    'CAX-II-A','CAX-II-B','CAX-II-C','CAX-II-D','CAX-II-F','CAX-III-A','CAX-III-B',
    'CAX-IV-A','CAX-IV-B','CAX-IV-C','CAX-IV-D','CAX-IV-E','CAX-IV-F','CAX-IV-M','CAX-IV-N',
    'CAX-V-A','CAX-V-B','CAX-V-C','CAX-V-D','CAX-V-E','CAX-VI-A','CAX-VI-B','CAX-VI-C','CAX-VI-D',
    'CAX-VII-A','CAX-VII-B','CAX-VII-C','CAX-VII-D','CAX-VII-E','CAX-VIII-A','CAX-VIII-B',
    'CAX-IX-A','CAX-IX-B','CAX-IX-C','CAX-IX-D','CAX-XI-A'
  ]::text[]),
  ('FAA-S-ACS-7B','commercial-amel-add-on',array[
    'CAX-I-F','CAX-I-G','CAX-II-A','CAX-II-B','CAX-II-C','CAX-II-D','CAX-II-F',
    'CAX-IV-A','CAX-IV-B','CAX-IV-E','CAX-IV-F','CAX-V-A',
    'CAX-VII-A','CAX-VII-B','CAX-VII-C','CAX-VII-D','CAX-VII-E',
    'CAX-IX-E','CAX-IX-F','CAX-IX-G','CAX-X-A','CAX-X-B','CAX-X-C','CAX-X-D'
  ]::text[]),
  ('FAA-S-ACS-25','cfi-asel',array[
    'CFI-I-A','CFI-I-B','CFI-I-C','CFI-I-D','CFI-I-E','CFI-I-F',
    'CFI-II-A','CFI-II-B','CFI-II-C','CFI-II-D','CFI-II-E','CFI-II-F','CFI-II-G','CFI-II-H','CFI-II-I','CFI-II-J','CFI-II-K','CFI-II-M','CFI-II-N','CFI-II-O',
    'CFI-III-A','CFI-III-B','CFI-III-C','CFI-IV-A','CFI-V-A','CFI-V-B','CFI-V-C','CFI-V-D','CFI-V-F','CFI-VI-A','CFI-VI-B',
    'CFI-VII-A','CFI-VII-B','CFI-VII-C','CFI-VII-D','CFI-VII-E','CFI-VII-F','CFI-VII-M','CFI-VII-N','CFI-VII-O',
    'CFI-VIII-A','CFI-VIII-B','CFI-VIII-C','CFI-VIII-D','CFI-IX-A','CFI-IX-B','CFI-IX-C','CFI-IX-D','CFI-IX-E','CFI-IX-F',
    'CFI-X-A','CFI-X-B','CFI-X-C','CFI-X-D','CFI-X-E','CFI-X-F','CFI-X-G','CFI-X-H','CFI-X-I',
    'CFI-XI-A','CFI-XI-B','CFI-XI-C','CFI-XI-D','CFI-XI-E','CFI-XII-A','CFI-XII-B','CFI-XII-C','CFI-XII-D','CFI-XIV-A'
  ]::text[]),
  ('FAA-S-ACS-25','mei-add-on',array[
    'CFI-II-C','CFI-II-K','CFI-II-P','CFI-V-D','CFI-VII-E','CFI-VII-F','CFI-IX-A',
    'CFI-X-A','CFI-X-C','CFI-X-D','CFI-X-E','CFI-X-I',
    'CFI-XII-A','CFI-XII-C','CFI-XII-D','CFI-XII-E','CFI-XII-F','CFI-XII-G',
    'CFI-XIII-A','CFI-XIII-B','CFI-XIII-C'
  ]::text[])
) as batch(publication_code, task_set_code, item_codes)
cross join lateral unnest(batch.item_codes) with ordinality as member(item_code, ordinality);

delete from public.acs_task_set_items mapping
using public.acs_task_sets task_set, public.acs_publications publication, portal_acs_task_set_seed seed
where mapping.task_set_id = task_set.id
  and task_set.publication_id = publication.id
  and publication.code = seed.publication_code
  and task_set.code = seed.task_set_code;

insert into public.acs_task_set_items (task_set_id, acs_item_id, sort_order)
select task_set.id, item.id, membership.sort_order
from portal_acs_task_set_membership membership
join portal_acs_item_seed seed
  on seed.publication_code = membership.publication_code
 and seed.item_code = membership.item_code
join public.acs_publications publication on publication.code = membership.publication_code
join public.acs_task_sets task_set
  on task_set.publication_id = publication.id
 and task_set.code = membership.task_set_code
join public.acs_items item
  on item.publication_id = publication.id
 and lower(btrim(item.area_of_operation)) = lower(btrim(seed.area_of_operation))
 and lower(btrim(item.task)) = lower(btrim(seed.task))
on conflict (task_set_id, acs_item_id) do update
set sort_order = excluded.sort_order;
