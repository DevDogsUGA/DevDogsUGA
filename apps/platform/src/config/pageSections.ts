/**
 * The sections and fields inside the settings and console pages, so search can
 * land on `/dashboard/profile#graduation` instead of just `/dashboard/profile`.
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
  "/dashboard/profile": [
    {
      id: "profile",
      label: "Profile",
      fields: [
        {
          id: "avatar",
          label: "Profile Photo",
          description:
            "Shown on your public profile, the community page, and anywhere else your account appears.",
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
            "Your expected graduation semester and year — used to verify your student status. Only the year is shown on your public profile.",
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
            "Add up to five links (e.g., portfolio, resume, socials) to display on your public profile. Use the arrows to reorder.",
        },
      ],
    },
    {
      id: "connectedAccounts",
      label: "Connected Accounts",
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
        {
          id: "connected-apps",
          label: "Connected apps",
          description:
            "Apps you have approved to sign you in with DevDogs. Remove access to sign out of one app and make it ask again.",
        },
      ],
    },
    {
      id: "publicProfileSettings",
      label: "Public Profile",
    },
    {
      id: "status",
      label: "Status",
      fields: [
        {
          id: "roles",
          label: "Roles",
          description:
            "Your roles within the club. Only officers can change these.",
        },
        {
          id: "roleDescription",
          label: "Role Description",
          description:
            "A short description of what you do, shown on the leadership section of the homepage.",
        },
        {
          id: "verification",
          label: "Profile Verification",
          description:
            "Complete all the steps below for your profile to appear on the DevDogs community page.",
        },
      ],
    },
    {
      id: "your-data",
      label: "Your Data",
      fields: [
        {
          id: "download-data",
          label: "Download my data",
          description:
            "A JSON file of what the DevDogs platform keeps about you: your profile, linked accounts (never their sign-in tokens), roles, attendance, reflections, survey answers, support threads, OAuth apps, schedule builder plans and the audit events you caused. DogDays and DogPack are separate apps and hold their own data about you.",
        },
      ],
    },
    {
      id: "delete-account",
      label: "Delete Account",
      fields: [
        {
          id: "delete",
          label: "Delete account",
          description:
            "Schedules your account for deletion in 14 days. Until then you can sign in and keep it. When the time is up, your profile, reflections, survey answers and OAuth apps are erased, and your attendance stays in the club's totals without your name. It isn't part of Save.",
        },
      ],
    },
  ],

  "/dashboard/oauth": [
    {
      id: "issuer",
      label: "Issuer URL",
      fields: [
        {
          id: "issuer-url",
          label: "Issuer URL",
          description:
            "Where an OpenID Connect provider (a custom OIDC provider in Supabase, for one) discovers DevDogs sign-in. Read from discovery, not typed in by hand. Copy it exactly: a provider set to any other issuer fails its issuer check.",
        },
      ],
    },
    {
      id: "apps",
      label: "Your apps",
      fields: [
        {
          id: "apps-list",
          label: "OAuth apps",
          description:
            "A logo, a homepage and a privacy policy are optional while you test. They are required before an officer can publish the app, and they are what members see on the consent screen. Open an app to add them.",
        },
      ],
    },
    {
      id: "test-accounts",
      label: "Test Accounts",
      fields: [
        {
          id: "test-accounts-list",
          label: "Test Accounts",
          description:
            "Sandboxed identities you can sign in as during the OAuth flow, so you can test without your own account.",
        },
      ],
    },
    {
      id: "moderation",
      label: "Moderation",
      fields: [
        {
          id: "moderation-clients",
          label: "Report and Block",
          description:
            "Sign reports from your app's backend, and receive the decisions moderators make. Reports from an app in Testing land in a sandbox on its page, never in the moderators' queue.",
        },
      ],
    },
  ],

  "/dashboard/permissions": [
    { id: "assign-roles", label: "Assign Roles" },
    { id: "role-definitions", label: "Role Definitions" },
  ],

  "/dashboard/reflections": [
    { id: "reflection-settings", label: "Reflection settings" },
  ],
};
