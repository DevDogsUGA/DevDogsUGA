-- `checkInClosesAt` out, `attendanceFormUrl` in.
--
-- The column existed to enforce a window: `checkIn(code)` compared against it
-- and refused a late redemption, so that somebody arriving at the end for the
-- pizza did not earn what somebody who sat through the workshop earned. With
-- the codes gone the platform enforces nothing -- the Airtable form's own open
-- and close is the only gate there is -- so the column had become a datetime
-- officers maintained that changed no behaviour anywhere.
--
-- A column nobody acts on is worse than an absent one: it reads as a control.
alter table "platform"."meetings" drop column "checkInClosesAt";

-- ============================================================
-- Where the form lives
-- ============================================================
--
-- The share link for the week's attendance form, pasted by an officer into
-- Airtable and pulled down like every other officer-authored field.
--
-- Stored rather than discovered, because it cannot be discovered.
--
-- > **Measured** on 2026-08-06: the Meta API returns views as `{id, name,
-- > type}` and nothing else. A form view's public `shr...` share token is not
-- > in that response, and the `viw...` id only resolves for somebody who is
-- > already a collaborator on the base — which a member is not. So there is no
-- > API path from "this meeting" to "this form", and one paste a week into the
-- > base an officer is already editing is the whole cost of the alternative.
--
-- Nullable: a meeting with no workshop, or one where attendance is being
-- collected some other way, simply has no link and the page says so.
alter table "platform"."meetings"
  add column "attendanceFormUrl" text;

comment on column "platform"."meetings"."attendanceFormUrl" is
  'Share link for this meeting''s Airtable attendance form. Pulled from Airtable; null when there is no form. Not discoverable via the API — a form view''s share token is not exposed.';

-- Rejects anything that is not an Airtable share link.
--
-- The value is rendered as an href on a public page, so an officer pasting the
-- wrong thing into the wrong field is one typo away from the platform pointing
-- members at somewhere else entirely. Constraining the host is what makes that
-- a rejected write rather than a link nobody thinks to check.
alter table "platform"."meetings"
  add constraint "meetings_attendanceFormUrl_airtable"
  check (
    "attendanceFormUrl" is null
    or "attendanceFormUrl" ~ '^https://airtable\.com/[A-Za-z0-9/_?=&.-]+$'
  );
