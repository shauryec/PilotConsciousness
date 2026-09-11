-- Canonical reusable Area of Operation and Task headings for the
-- Commercial Pilot for Airplane Category ACS (FAA-S-ACS-7B), filtered to
-- Tasks applicable to ASEL or to airplane applicants generally.
--
-- Existing matching task records are reused so lesson mappings remain intact.
-- Only headings that do not already exist are inserted.

insert into public.acs_publications (code, title, revision)
values (
  'FAA-S-ACS-7B',
  'Commercial Pilot for Airplane Category Airman Certification Standards',
  '7B'
)
on conflict (code) do update
set title = excluded.title,
    revision = excluded.revision;

do $$
declare
  commercial_publication_id uuid;
  seed record;
  matching_item_id uuid;
begin
  select id
  into commercial_publication_id
  from public.acs_publications
  where code = 'FAA-S-ACS-7B';

  for seed in
    select *
    from (values
      ('CAX-I-A',   'I. Preflight Preparation',                                      'A. Pilot Qualifications',                                                    1),
      ('CAX-I-B',   'I. Preflight Preparation',                                      'B. Airworthiness Requirements',                                              2),
      ('CAX-I-C',   'I. Preflight Preparation',                                      'C. Weather Information',                                                     3),
      ('CAX-I-D',   'I. Preflight Preparation',                                      'D. Cross-Country Flight Planning',                                            4),
      ('CAX-I-E',   'I. Preflight Preparation',                                      'E. National Airspace System',                                                 5),
      ('CAX-I-F',   'I. Preflight Preparation',                                      'F. Performance and Limitations',                                              6),
      ('CAX-I-G',   'I. Preflight Preparation',                                      'G. Operation of Systems',                                                     7),
      ('CAX-I-H',   'I. Preflight Preparation',                                      'H. Human Factors',                                                            8),
      ('CAX-II-A',  'II. Preflight Procedures',                                      'A. Preflight Assessment',                                                     9),
      ('CAX-II-B',  'II. Preflight Procedures',                                      'B. Flight Deck Management',                                                  10),
      ('CAX-II-C',  'II. Preflight Procedures',                                      'C. Engine Starting',                                                         11),
      ('CAX-II-D',  'II. Preflight Procedures',                                      'D. Taxiing (ASEL, AMEL)',                                                    12),
      ('CAX-II-F',  'II. Preflight Procedures',                                      'F. Before Takeoff Check',                                                    13),
      ('CAX-III-A', 'III. Airport and Seaplane Base Operations',                     'A. Communications, Light Signals, and Runway Lighting Systems',              14),
      ('CAX-III-B', 'III. Airport and Seaplane Base Operations',                     'B. Traffic Patterns',                                                        15),
      ('CAX-IV-A',  'IV. Takeoffs, Landings, and Go-Arounds',                        'A. Normal Takeoff and Climb',                                                 16),
      ('CAX-IV-B',  'IV. Takeoffs, Landings, and Go-Arounds',                        'B. Normal Approach and Landing',                                              17),
      ('CAX-IV-C',  'IV. Takeoffs, Landings, and Go-Arounds',                        'C. Soft-Field Takeoff and Climb (ASEL)',                                      18),
      ('CAX-IV-D',  'IV. Takeoffs, Landings, and Go-Arounds',                        'D. Soft-Field Approach and Landing (ASEL)',                                   19),
      ('CAX-IV-E',  'IV. Takeoffs, Landings, and Go-Arounds',                        'E. Short-Field Takeoff and Maximum Performance Climb (ASEL, AMEL)',           20),
      ('CAX-IV-F',  'IV. Takeoffs, Landings, and Go-Arounds',                        'F. Short-Field Approach and Landing (ASEL, AMEL)',                            21),
      ('CAX-IV-M',  'IV. Takeoffs, Landings, and Go-Arounds',                        'M. Power-Off 180° Accuracy Approach and Landing (ASEL, ASES)',                22),
      ('CAX-IV-N',  'IV. Takeoffs, Landings, and Go-Arounds',                        'N. Go-Around/Rejected Landing',                                               23),
      ('CAX-V-A',   'V. Performance Maneuvers and Ground Reference Maneuvers',       'A. Steep Turns',                                                             24),
      ('CAX-V-B',   'V. Performance Maneuvers and Ground Reference Maneuvers',       'B. Steep Spiral (ASEL, ASES)',                                               25),
      ('CAX-V-C',   'V. Performance Maneuvers and Ground Reference Maneuvers',       'C. Chandelles (ASEL, ASES)',                                                 26),
      ('CAX-V-D',   'V. Performance Maneuvers and Ground Reference Maneuvers',       'D. Lazy Eights (ASEL, ASES)',                                                27),
      ('CAX-V-E',   'V. Performance Maneuvers and Ground Reference Maneuvers',       'E. Eights on Pylons (ASEL, ASES)',                                           28),
      ('CAX-VI-A',  'VI. Navigation',                                                 'A. Pilotage and Dead Reckoning',                                              29),
      ('CAX-VI-B',  'VI. Navigation',                                                 'B. Navigation Systems and Radar Services',                                    30),
      ('CAX-VI-C',  'VI. Navigation',                                                 'C. Diversion',                                                                31),
      ('CAX-VI-D',  'VI. Navigation',                                                 'D. Lost Procedures',                                                          32),
      ('CAX-VII-A', 'VII. Slow Flight and Stalls',                                   'A. Maneuvering During Slow Flight',                                           33),
      ('CAX-VII-B', 'VII. Slow Flight and Stalls',                                   'B. Power-Off Stalls',                                                         34),
      ('CAX-VII-C', 'VII. Slow Flight and Stalls',                                   'C. Power-On Stalls',                                                          35),
      ('CAX-VII-D', 'VII. Slow Flight and Stalls',                                   'D. Accelerated Stalls',                                                       36),
      ('CAX-VII-E', 'VII. Slow Flight and Stalls',                                   'E. Spin Awareness',                                                           37),
      ('CAX-VIII-A','VIII. High-Altitude Operations',                                'A. Supplemental Oxygen',                                                      38),
      ('CAX-VIII-B','VIII. High-Altitude Operations',                                'B. Pressurization',                                                           39),
      ('CAX-IX-A',  'IX. Emergency Operations',                                      'A. Emergency Descent',                                                        40),
      ('CAX-IX-B',  'IX. Emergency Operations',                                      'B. Emergency Approach and Landing (Simulated) (ASEL, ASES)',                  41),
      ('CAX-IX-C',  'IX. Emergency Operations',                                      'C. Systems and Equipment Malfunctions',                                       42),
      ('CAX-IX-D',  'IX. Emergency Operations',                                      'D. Emergency Equipment and Survival Gear',                                    43),
      ('CAX-XI-A',  'XI. Postflight Procedures',                                     'A. After Landing, Parking, and Securing (ASEL, AMEL)',                         44)
    ) as task_seed(code, area_of_operation, task, sort_order)
  loop
    select id
    into matching_item_id
    from public.acs_items
    where publication_id = commercial_publication_id
      and lower(btrim(area_of_operation)) = lower(btrim(seed.area_of_operation))
      and lower(btrim(task)) = lower(btrim(seed.task))
    order by sort_order, id
    limit 1;

    if matching_item_id is null then
      insert into public.acs_items (
        publication_id,
        code,
        area_of_operation,
        task,
        element_type,
        description,
        sort_order
      ) values (
        commercial_publication_id,
        seed.code,
        seed.area_of_operation,
        seed.task,
        'skill',
        seed.task,
        seed.sort_order
      )
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
