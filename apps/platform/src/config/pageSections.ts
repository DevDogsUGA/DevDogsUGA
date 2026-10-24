/**
 * The sections and fields inside the settings and console pages, so search can
 * land on `/settings/profile#graduation` instead of just `/settings/profile`.
 *
 * Every `id` here is the anchor the page already renders, `Panel`'s (or
 * `ConsoleCard.Root`'s) `id` for a section and `Field`'s (or `SettingsAnchor`'s)
 * `id` for a field, and every label and
 * description is the copy that page shows. That duplication is deliberate: the
 * pages stay plain readable JSX rather than being driven by this table.
 * `pageSections.test.ts` parses the page sources and fails if the two drift.
 *
 * Only pages built from `Panel`/`ConsoleCard` + `Field` appear here. The console's
 * table-driven pages (moderation, feedback, audit log) have no
 * stable in-page anchors to point at.
 */

/** One `<Field>` on a page. */
export interface PageField {
  /** Anchor id. Matches the `id` prop on the page's `<Field>`. */
  id: string;
  label: string;
  description?: string;
}

/** One `<Panel>` (or `<ConsoleCard.Root>`) on a page, with the fields it contains. */
export interface PageSection {
  /** Anchor id. Matches the `id` prop on the page's `<Panel>` or `<ConsoleCard.Root>`. */
  id: string;
  /** The panel's `title` (or the card's `<ConsoleCard.Header title>`). */
  label: string;
  fields?: PageField[];
}

/** Keyed by the page's href, which must be a `href` from `./nav`. */
export const PAGE_SECTIONS: Record<string, PageSection[]> = {
  "/settings/profile": [
    {
      id: "details",
      label: "Your details",
      fields: [
        {
          id: "avatar",
          label: "Profile Photo",
          description:
            "Press your photo to change it. Shown on your public profile, the community page and anywhere else your account appears.",
        },
        {
          id: "preferredName",
          label: "Preferred Name",
          description: "Displayed across DevDogs instead of your legal name.",
        },
        {
          id: "pronouns",
          label: "Pronouns",
          description:
            "Select from common options or add your own. Shown on your public profile.",
        },
        {
          id: "graduation",
          label: "Graduation",
          description:
            "Your expected graduation semester and year. Used to verify your student status. Only the year is shown on your public profile.",
        },
        {
          id: "academics",
          label: "Academics",
          description:
            "Select all of your UGA programs of study, including majors, minors, graduate programs, and certificates. Your majors (not minors or certificates) are shown on your public profile.",
        },
        {
          id: "bio",
          label: "Bio",
          description: "A short description of yourself.",
        },
        {
          id: "links",
          label: "Links",
          description:
            "Up to five links (a portfolio, a résumé, socials), shown on your public profile. Use the arrows to reorder.",
        },
      ],
    },
    // No fields: they are rendered inside PublicProfileSection, which shares
    // draft state between them, so the page source has no `<Field>` to mirror.
    // The panel anchor still lands search on the section.
    { id: "publicProfileSettings", label: "Public profile" },
    // No fields: the switches are rendered by BadgeVisibility, one per badge
    // the member holds, so the page source has no `<Field>` to mirror.
    { id: "badges", label: "Badges" },
    {
      id: "roles",
      label: "Roles",
      fields: [
        { id: "roles-list", label: "Your roles" },
        // Rendered only for leaders. Indexed for everyone: the field's existence
        // is not sensitive, and gating it would mean threading `isLeader` into
        // the search route for one anchor.
        {
          id: "roleDescription",
          label: "Role Description",
          description:
            "A short description of what you do, shown under your name on your profile and on the leadership section of the homepage.",
        },
      ],
    },
  ],

  "/settings/accounts": [
    {
      id: "accounts",
      label: "Accounts",
      fields: [
        {
          id: "email",
          label: "UGA MyID Email",
          description:
            "Obtained via UGA SSO and used for sign-in. This can't be changed here.",
        },
        {
          id: "github",
          label: "GitHub",
          description:
            "Linking GitHub is part of verifying your account and is needed to create an OAuth client for testing DevDogs sign-in. You contribute from your own fork, so it does not add you to the DevDogs organization.",
        },
        {
          id: "discord",
          label: "Discord",
          description:
            "Linking Discord adds you to the DevDogs Discord server.",
        },
        {
          id: "linkedin",
          label: "LinkedIn",
          description:
            "Link your LinkedIn profile to display it on your public profile.",
        },
      ],
    },
    { id: "verification", label: "Verification" },
  ],

  "/settings/oauth": [
    { id: "issuer", label: "Issuer URL" },
    { id: "dev-clients", label: "Development clients" },
    { id: "test-accounts", label: "Test accounts" },
    {
      id: "moderation",
      label: "Moderation",
      fields: [
        {
          id: "moderation-clients",
          label: "Report and Block",
          description:
            "Sign reports from your app's backend, and receive the decisions moderators make. Reports from a development client land in the sandbox below, never in the moderators' queue.",
        },
      ],
    },
    { id: "production-clients", label: "Production clients" },
  ],

  "/console/permissions": [
    { id: "assign-roles", label: "Assign roles" },
    { id: "role-definitions", label: "Role definitions" },
  ],

  "/console/reflections": [
    { id: "reflection-settings", label: "Reflection settings" },
  ],
};
