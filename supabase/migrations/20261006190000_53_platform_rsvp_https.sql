-- Bevy interest meetings need external RSVP links. Keep the scheme,
-- userinfo and path-character guards aligned with @devdogsuga/events.
alter table platform.meetings drop constraint "meetings_rsvpUrl_host";
alter table platform.meetings add constraint "meetings_rsvpUrl_host" check (
  "rsvpUrl" is null
  or "rsvpUrl" ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(/[A-Za-z0-9/_?=&.%#:~-]*)?$'
);
comment on column platform.meetings."rsvpUrl" is
  'HTTPS RSVP event page (Bevy, Involvement Network, or another event host); no userinfo.';
