-- Production Root-bootstrap: grant Root to the earliest non-test user if nobody
-- holds it yet. Idempotent: the uniqueIndex on (roleId = ROOT_ID) makes a
-- second holder a conflict; ON CONFLICT DO NOTHING keeps this a no-op when
-- Root is already held (the normal case on every run after the first).

insert into "platform"."userRoles" ("userId", "roleId")
select p."userId", '00000000-0000-0000-0000-000000000002'::uuid
from "platform"."profile" p
inner join auth.users u on u.id = p."userId"
where not exists (
  select 1 from "platform"."userRoles" ur
  where ur."roleId" = '00000000-0000-0000-0000-000000000002'::uuid
)
and not exists (
  select 1 from "platform"."oauthTestAccounts" ota
  where ota."testUserId" = p."userId"
)
order by u.created_at asc
limit 1
on conflict ("userId", "roleId") do nothing;
