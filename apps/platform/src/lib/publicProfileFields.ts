/**
 * The public-profile switches on `platform.profile`, and the words the UI uses
 * for them. Lives outside the server action because a `"use server"` module
 * may export only async functions, and the settings UI needs the list too.
 */

/** The master switch and the seven per-field switches. */
export const PUBLIC_PROFILE_FIELDS = [
  "publicProfile",
  "showName",
  "showAvatar",
  "showBio",
  "showLinks",
  "showCompetitions",
  "showContributions",
  "showStars",
] as const;

export type PublicProfileField = (typeof PUBLIC_PROFILE_FIELDS)[number];

export type PublicProfileSwitches = Record<PublicProfileField, boolean>;

/** The per-field switches in the order /account shows them, with their copy. */
export const PUBLIC_PROFILE_FIELD_OPTIONS: ReadonlyArray<{
  field: Exclude<PublicProfileField, "publicProfile">;
  label: string;
  description: string;
}> = [
  {
    field: "showName",
    label: "Name",
    description: "Your preferred name. When hidden, your handle is shown.",
  },
  {
    field: "showAvatar",
    label: "Profile Photo",
    description: "Your photo, if you have uploaded one.",
  },
  {
    field: "showBio",
    label: "Bio",
    description: "Your bio and, for officers, your role description.",
  },
  {
    field: "showLinks",
    label: "Links",
    description: "The links you added to your profile.",
  },
  {
    field: "showCompetitions",
    label: "Competitions",
    description: "Competitions you entered with a team.",
  },
  {
    field: "showContributions",
    label: "Contributions",
    description: "Merged pull requests credited to you through a team.",
  },
  {
    field: "showStars",
    label: "Stars",
    description: "Your star totals.",
  },
];

/** The message a field's toggle announces, e.g. "Bio shown on public profile". */
export function publicProfileToastLabel(field: PublicProfileField): string {
  if (field === "publicProfile") return "Public profile";
  return (
    PUBLIC_PROFILE_FIELD_OPTIONS.find((o) => o.field === field)?.label ?? field
  );
}
