/**
 * The sections and fields inside the account, console, and tools pages, so
 * search can land on `/account#graduation` instead of just `/account`.
 *
 * Every `id` here is the anchor the page already renders — `ConsoleCard.Root`'s
 * `id` for a section, `Field`'s `id` for a field — and every label/description
 * is the copy that page shows. That duplication is deliberate: the pages stay
 * plain readable JSX rather than being driven by this table. `pageSections.test.ts`
 * parses the page sources and fails if the two ever drift.
 *
 * Only pages built from `ConsoleCard` + `Field` appear here. The console's
 * table-driven pages (moderation, feedback, audit log, credentials) have no
 * stable in-page anchors to point at.
 */

/** One `<Field>` on a page. */
export interface PageField {
  /** Anchor id — matches the `id` prop on the page's `<Field>`. */
  id: string;
  label: string;
  description?: string;
}

/** One `<ConsoleCard.Root>` on a page, with the fields it contains. */
export interface PageSection {
  /** Anchor id — matches the `id` prop on the page's `<ConsoleCard.Root>`. */
  id: string;
  /** The card's `<ConsoleCard.Header title>`. */
  label: string;
  fields?: PageField[];
}

/** Keyed by the page's href, which must be a `href` from `./nav`. */
export const PAGE_SECTIONS: Record<string, PageSection[]> = {
  "/account": [
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
            "Your expected graduation semester and year — used to verify your student status.",
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
            "Add up to five links (e.g., portfolio, resume, socials) to display on your public profile. Drag to reorder.",
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
            "Linking GitHub adds you to the DevDogs organization and grants access to this year's project repositories.",
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
        // Rendered only for leaders. Indexed for everyone: the field's existence
        // is not sensitive, and gating it would mean threading `isLeader` into
        // the search route for one anchor.
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
  ],

  "/tools/oauth": [
    {
      id: "credentials",
      label: "Credentials",
      fields: [
        {
          id: "client-credentials",
          label: "Client ID",
          description:
            "Copy these into your project's environment variables to enable DevDogs sign-in locally.",
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
            "Sandboxed identities you can sign in as during the OAuth flow, without using your real DevDogs account.",
        },
      ],
    },
  ],

  // The app is chosen inside each card rather than getting a card of its own:
  // configuration is per app now, and a card per registered app would make
  // these anchors depend on the registry's contents — searchable ids that
  // change whenever an app is added, on an instance this page isn't even
  // pointed at.
  "/tools/moderation": [
    {
      id: "instance",
      label: "Target Instance",
      fields: [
        {
          id: "instance-target",
          label: "Target Instance",
          description:
            "The Supabase project these tools act on. Production instances are refused.",
        },
      ],
    },
    {
      id: "reasons",
      label: "Report Reasons",
      fields: [
        {
          id: "report-reasons",
          label: "Report Reasons",
          description:
            "The reasons a user can select when filing a content report against an app.",
        },
      ],
    },
    {
      id: "content-types",
      label: "Content Types",
      fields: [
        {
          id: "content-types-list",
          label: "Content Types",
          description:
            "What the catalog detected in each app's schema, and whether the integration holds up.",
        },
      ],
    },
    {
      id: "queue",
      label: "Report Queue",
      fields: [
        {
          id: "report-queue",
          label: "Report Queue",
          description:
            "Reports filed on the target instance, and the same resolution form production moderation uses.",
        },
      ],
    },
  ],

  "/tools/feedback": [
    {
      id: "instance",
      label: "Target Instance",
      fields: [
        {
          id: "instance-target",
          label: "Target Instance",
          description:
            "The Supabase project these tools act on. Production instances are refused.",
        },
      ],
    },
    {
      id: "topics",
      label: "Feedback Topics",
      fields: [
        {
          id: "feedback-topics",
          label: "Feedback Topics",
          description:
            "The topics users can choose from when submitting feedback about an app. Apply a template to get started quickly, or add your own.",
        },
      ],
    },
    {
      id: "submissions",
      label: "Submissions",
      fields: [
        {
          id: "feedback-submissions",
          label: "Submissions",
          description:
            "Feedback on the target instance, subject to row-level security as whoever you signed in as there.",
        },
      ],
    },
  ],

  "/console/permissions": [
    { id: "root-access", label: "Root Access" },
    { id: "assign-roles", label: "Assign Roles" },
    { id: "role-definitions", label: "Role Definitions" },
  ],

  "/console/verification": [
    {
      id: "import-involvement",
      label: "Import Involvement",
      fields: [
        {
          id: "roster-csv",
          label: "Roster CSV",
          description:
            "Export the membership roster from the UGA Involvement Network and upload it here. Members whose name and email match a profile are marked verified.",
        },
      ],
    },
  ],
};
