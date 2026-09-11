-- Canonical reusable Area of Operation and Task headings for the
-- Instrument Rating - Airplane ACS (FAA-S-ACS-8C).
--
-- Existing matching task records are reused so lesson mappings remain intact.
-- Only headings that do not already exist are inserted.

insert into public.acs_publications (code, title, revision)
values (
  'FAA-S-ACS-8C',
  'Instrument Rating - Airplane Airman Certification Standards',
  '8C'
)
on conflict (code) do update
set title = excluded.title,
    revision = excluded.revision;

do $$
declare
  instrument_publication_id uuid;
  seed record;
  matching_item_id uuid;
begin
  select id
  into instrument_publication_id
  from public.acs_publications
  where code = 'FAA-S-ACS-8C';

  for seed in
    select *
    from (values
      ('IRA-I-A',    'I. Preflight Preparation',                                    'A. Pilot Qualifications',                                                  1),
      ('IRA-I-B',    'I. Preflight Preparation',                                    'B. Weather Information',                                                   2),
      ('IRA-I-C',    'I. Preflight Preparation',                                    'C. Cross-Country Flight Planning',                                          3),
      ('IRA-II-A',   'II. Preflight Procedures',                                    'A. Aircraft Systems Related to IFR Operations',                              4),
      ('IRA-II-B',   'II. Preflight Procedures',                                    'B. Aircraft Flight Instruments and Navigation Equipment',                    5),
      ('IRA-II-C',   'II. Preflight Procedures',                                    'C. Instrument Flight Deck Check',                                            6),
      ('IRA-III-A',  'III. Air Traffic Control (ATC) Clearances and Procedures',     'A. Compliance with Air Traffic Control Clearances',                           7),
      ('IRA-III-B',  'III. Air Traffic Control (ATC) Clearances and Procedures',     'B. Holding Procedures',                                                      8),
      ('IRA-IV-A',   'IV. Flight by Reference to Instruments',                       'A. Instrument Flight',                                                       9),
      ('IRA-IV-B',   'IV. Flight by Reference to Instruments',                       'B. Recovery from Unusual Flight Attitudes',                                  10),
      ('IRA-V-A',    'V. Navigation Systems',                                        'A. Intercepting and Tracking Navigational Systems and DME Arcs',             11),
      ('IRA-V-B',    'V. Navigation Systems',                                        'B. Departure, En Route, and Arrival Operations',                             12),
      ('IRA-VI-A',   'VI. Instrument Approach Procedures',                           'A. Non-precision Approach',                                                  13),
      ('IRA-VI-B',   'VI. Instrument Approach Procedures',                           'B. Precision Approach',                                                      14),
      ('IRA-VI-C',   'VI. Instrument Approach Procedures',                           'C. Missed Approach',                                                         15),
      ('IRA-VI-D',   'VI. Instrument Approach Procedures',                           'D. Circling Approach',                                                       16),
      ('IRA-VI-E',   'VI. Instrument Approach Procedures',                           'E. Landing from an Instrument Approach',                                     17),
      ('IRA-VII-A',  'VII. Emergency Operations',                                    'A. Loss of Communications',                                                  18),
      ('IRA-VII-D',  'VII. Emergency Operations',                                    'D. Approach with Loss of Primary Flight Instrument Indicators',              19),
      ('IRA-VIII-A', 'VIII. Postflight Procedures',                                  'A. Checking Instruments and Equipment',                                      20)
    ) as task_seed(code, area_of_operation, task, sort_order)
  loop
    select id
    into matching_item_id
    from public.acs_items
    where publication_id = instrument_publication_id
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
        instrument_publication_id,
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
