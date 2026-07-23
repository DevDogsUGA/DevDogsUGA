-- Avatar storage policies (previously blocked by a Drizzle 1.0.0-rc.3 bug that
-- prevented policies targeting storage.objects from taking effect via pgPolicy).

create policy "avatar_insert_policy"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND path_tokens = ARRAY[(auth.uid())::text]
);

create policy "avatar_update_policy"
on "storage"."objects"
as permissive
for update
to authenticated
using (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND path_tokens = ARRAY[(auth.uid())::text]
)
with check (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND path_tokens = ARRAY[(auth.uid())::text]
);

create policy "avatar_delete_policy"
on "storage"."objects"
as permissive
for delete
to authenticated
using (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
);
