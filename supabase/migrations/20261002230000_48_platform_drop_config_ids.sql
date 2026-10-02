-- Drop `meetings.configId` and `workshops.configId`.
--
-- They held each row's id in `@devdogsuga/events`, which the config reconcile
-- matched on. The events config has no ids any more: a meeting is its
-- authored `slug` and a workshop its title within its meeting, and the
-- reconcile matches on those. That reconcile shipped a deploy before this
-- migration (production migrations run before the code deploys), so nothing
-- deployed reads or writes these columns.
--
-- Their partial unique indexes go with them; the columns' comments drop with
-- the columns.

drop index "platform"."meetings_configId_live_key";
drop index "platform"."workshops_configId_live_key";

alter table "platform"."meetings" drop column "configId";
alter table "platform"."workshops" drop column "configId";
