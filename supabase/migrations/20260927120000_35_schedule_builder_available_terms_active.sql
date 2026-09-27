-- `schedule_builder."availableTerms"` counted a term as available the moment
-- any offering existed for it, cancelled or not. A term whose sections all
-- get cancelled after the scrape still showed up in the term picker with
-- nothing plannable inside it.
--
-- `create or replace view` keeps the same OID, so the grants `alter default
-- privileges` handed this view when migration 08 created it survive
-- untouched -- there is nothing to re-grant here.

create or replace view "schedule_builder"."availableTerms" as (
  select
    "schedule_builder"."terms"."academicPeriod",
    "schedule_builder"."terms"."description"
  from "schedule_builder"."terms"
  inner join "schedule_builder"."offerings"
    on "schedule_builder"."offerings"."academicPeriod" = "schedule_builder"."terms"."academicPeriod"
  where "schedule_builder"."offerings"."cancelled" = false
  group by "schedule_builder"."terms"."academicPeriod", "schedule_builder"."terms"."description"
  order by "schedule_builder"."terms"."academicPeriod" desc
);
