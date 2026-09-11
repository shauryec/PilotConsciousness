-- Canonical reusable Area of Operation and Task headings for the
-- Private Pilot for Airplane Category ACS (FAA-S-ACS-6C).
--
-- This migration preserves any existing matching task record (and therefore
-- any lesson mappings to it), normalizes its display text and ordering, and
-- inserts only headings that do not already exist.

insert into public.acs_publications (code, title, revision)
values (
  'FAA-S-ACS-6C',
  'Private Pilot for Airplane Category Airman Certification Standards',
  '6C'
)
on conflict (code) do update
set title = excluded.title,
    revision = excluded.revision;

do $$
declare
  private_publication_id uuid;
  seed record;
  matching_item_id uuid;
begin
  select id
  into private_publication_id
  from public.acs_publications
  where code = 'FAA-S-ACS-6C';

  for seed in
    select *
    from (values
      ('PPL-I-A',    'I. Preflight Preparation',                                      'A. Pilot Qualifications',                                                        1),
      ('PPL-I-B',    'I. Preflight Preparation',                                      'B. Airworthiness Requirements',                                                  2),
      ('PPL-I-C',    'I. Preflight Preparation',                                      'C. Weather Information',                                                         3),
      ('PPL-I-D',    'I. Preflight Preparation',                                      'D. Cross-Country Flight Planning',                                                4),
      ('PPL-I-E',    'I. Preflight Preparation',                                      'E. National Airspace System',                                                     5),
      ('PPL-I-F',    'I. Preflight Preparation',                                      'F. Performance and Limitations',                                                  6),
      ('PPL-I-G',    'I. Preflight Preparation',                                      'G. Operation of Systems',                                                         7),
      ('PPL-I-H',    'I. Preflight Preparation',                                      'H. Human Factors',                                                                8),
      ('PPL-II-A',   'II. Preflight Procedures',                                      'A. Preflight Assessment',                                                         9),
      ('PPL-II-B',   'II. Preflight Procedures',                                      'B. Flight Deck Management',                                                      10),
      ('PPL-II-C',   'II. Preflight Procedures',                                      'C. Engine Starting',                                                             11),
      ('PPL-II-D',   'II. Preflight Procedures',                                      'D. Taxiing (ASEL, AMEL)',                                                        12),
      ('PPL-II-F',   'II. Preflight Procedures',                                      'F. Before Takeoff Check',                                                        13),
      ('PPL-III-A',  'III. Airport and Seaplane Base Operations',                     'A. Communications, Light Signals, and Runway Lighting Systems',                  14),
      ('PPL-III-B',  'III. Airport and Seaplane Base Operations',                     'B. Traffic Patterns',                                                            15),
      ('PPL-IV-A',   'IV. Takeoffs, Landings, and Go-Arounds',                        'A. Normal Takeoff and Climb',                                                     16),
      ('PPL-IV-B',   'IV. Takeoffs, Landings, and Go-Arounds',                        'B. Normal Approach and Landing',                                                  17),
      ('PPL-IV-C',   'IV. Takeoffs, Landings, and Go-Arounds',                        'C. Soft-Field Takeoff and Climb (ASEL)',                                          18),
      ('PPL-IV-D',   'IV. Takeoffs, Landings, and Go-Arounds',                        'D. Soft-Field Approach and Landing (ASEL)',                                       19),
      ('PPL-IV-E',   'IV. Takeoffs, Landings, and Go-Arounds',                        'E. Short-Field Takeoff and Maximum Performance Climb (ASEL, AMEL)',               20),
      ('PPL-IV-F',   'IV. Takeoffs, Landings, and Go-Arounds',                        'F. Short-Field Approach and Landing (ASEL, AMEL)',                                21),
      ('PPL-IV-M',   'IV. Takeoffs, Landings, and Go-Arounds',                        'M. Forward Slip to a Landing (ASEL, ASES)',                                       22),
      ('PPL-IV-N',   'IV. Takeoffs, Landings, and Go-Arounds',                        'N. Go-Around/Rejected Landing',                                                   23),
      ('PPL-V-A',    'V. Performance Maneuvers and Ground Reference Maneuvers',       'A. Steep Turns',                                                                 24),
      ('PPL-V-B',    'V. Performance Maneuvers and Ground Reference Maneuvers',       'B. Ground Reference Maneuvers',                                                  25),
      ('PPL-VI-A',   'VI. Navigation',                                                 'A. Pilotage and Dead Reckoning',                                                  26),
      ('PPL-VI-B',   'VI. Navigation',                                                 'B. Navigation Systems and Radar Services',                                        27),
      ('PPL-VI-C',   'VI. Navigation',                                                 'C. Diversion',                                                                    28),
      ('PPL-VI-D',   'VI. Navigation',                                                 'D. Lost Procedures',                                                              29),
      ('PPL-VII-A',  'VII. Slow Flight and Stalls',                                   'A. Maneuvering During Slow Flight',                                               30),
      ('PPL-VII-B',  'VII. Slow Flight and Stalls',                                   'B. Power-Off Stalls',                                                             31),
      ('PPL-VII-C',  'VII. Slow Flight and Stalls',                                   'C. Power-On Stalls',                                                              32),
      ('PPL-VII-D',  'VII. Slow Flight and Stalls',                                   'D. Spin Awareness',                                                               33),
      ('PPL-VIII-A', 'VIII. Basic Instrument Maneuvers',                              'A. Straight-and-Level Flight',                                                    34),
      ('PPL-VIII-B', 'VIII. Basic Instrument Maneuvers',                              'B. Constant Airspeed Climbs',                                                     35),
      ('PPL-VIII-C', 'VIII. Basic Instrument Maneuvers',                              'C. Constant Airspeed Descents',                                                   36),
      ('PPL-VIII-D', 'VIII. Basic Instrument Maneuvers',                              'D. Turns to Headings',                                                            37),
      ('PPL-VIII-E', 'VIII. Basic Instrument Maneuvers',                              'E. Recovery from Unusual Flight Attitudes',                                       38),
      ('PPL-VIII-F', 'VIII. Basic Instrument Maneuvers',                              'F. Radio Communications, Navigation Systems/Facilities, and Radar Services',      39),
      ('PPL-IX-A',   'IX. Emergency Operations',                                      'A. Emergency Descent',                                                            40),
      ('PPL-IX-B',   'IX. Emergency Operations',                                      'B. Emergency Approach and Landing (Simulated) (ASEL, ASES)',                      41),
      ('PPL-IX-C',   'IX. Emergency Operations',                                      'C. Systems and Equipment Malfunctions',                                           42),
      ('PPL-IX-D',   'IX. Emergency Operations',                                      'D. Emergency Equipment and Survival Gear',                                        43),
      ('PPL-XI-A',   'XI. Night Operations',                                          'A. Night Operations',                                                             44),
      ('PPL-XII-A',  'XII. Postflight Procedures',                                    'A. After Landing, Parking, and Securing (ASEL, AMEL)',                             45)
    ) as task_seed(code, area_of_operation, task, sort_order)
  loop
    select id
    into matching_item_id
    from public.acs_items
    where publication_id = private_publication_id
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
        private_publication_id,
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
