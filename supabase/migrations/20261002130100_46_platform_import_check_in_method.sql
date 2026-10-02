-- Record imported check-ins as their own method.
--
-- Check-in is still the only writer to `platform.attendance` from the platform:
-- a member scans the QR or types the code, and the row is `qr` or
-- `manual_code`. The one other writer is `backstage attendance import`, which an
-- officer runs from a sign-in form or sheet for a meeting where members could
-- not check in. Its rows carry method `import`, so they stay distinguishable
-- from check-ins and can be replaced by re-running the import. The import never
-- overwrites a member's own check-in.
--
-- `add value` cannot be used by anything else in the same transaction that
-- adds it, so nothing here references `import`.

alter type "platform"."checkInMethod" add value if not exists 'import';

comment on table "platform"."attendance" is
  'One row per member per meeting. Check-in is the only writer from the platform (method qr or manual_code). The one other writer is `backstage attendance import`, which an officer runs from a sign-in form or sheet for a meeting where members could not check in; its rows carry method import so they stay distinguishable and can be replaced. An import never overwrites a member''s own check-in.';
