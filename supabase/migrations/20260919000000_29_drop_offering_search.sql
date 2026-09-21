-- Drop the `offeringSearch` materialized view.
--
-- It backed the schedule builder's free-text course search, which has been
-- replaced by add-by-subject / add-by-instructor / add-by-CRN filters that read
-- the base `subjects`, `instructors`, `courses`, and `offerings` tables
-- directly. Nothing reads the view any more, and the scrape-registrar cron no
-- longer creates its indexes or refreshes it.
--
-- `cascade` drops the two indexes the cron built on it
-- (`offeringSearch_academicPeriod_crn_idx`, `offeringSearch_fts_idx`) along with
-- the view. `if exists` keeps this idempotent across environments where the
-- view may never have been created.

drop materialized view if exists "schedule_builder"."offeringSearch" cascade;
