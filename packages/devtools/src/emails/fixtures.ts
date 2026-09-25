import type { Templates } from "@devdogsuga/email";

/**
 * Credible, non-sensitive values for local previews.
 *
 * `satisfies` is the maintenance mechanism: a new template or prop cannot be
 * shipped without deciding what its preview should say.
 */
export const EMAIL_FIXTURES = {
  JoinRequest: {
    leadName: "Jordan",
    applicantName: "Avery",
    teamName: "Byte Bulldogs",
    reviewUrl: "https://devdogsuga.org/teams/requests",
  },
  TeamInvite: {
    inviteeName: "Avery",
    teamName: "Byte Bulldogs",
    leadName: "Jordan",
    acceptUrl: "https://devdogsuga.org/teams/requests",
  },
} satisfies { [K in keyof Templates]: Templates[K] };
