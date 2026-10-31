import "server-only";
import { env } from "~/env";
import {
  CONFIG_REPO,
  configPrsAvailable,
  isStagingPr,
  officerIdentity,
} from "~/server/config/proposals";
import { proposeTrustedFilePr } from "~/server/config/trustedFilePr";
import { consumeRateLimit } from "~/server/rateLimit";
import { getDocsProjects } from "./queries";
import { createDocsStore } from "./docsStore";
import type { DocsDeps } from "./docsProposals";

const PRS_PER_HOUR = 3;

/**
 * The docs proposals wired to the real world: the database store, the shared
 * pull request transport with the config-PR App's credentials (the writer the
 * schedule editor uses, never the read-only commit-sync App), and the same
 * hourly limit the schedule editor has.
 */
export function docsDeps(): DocsDeps {
  return {
    store: createDocsStore(),
    propose: (input) => proposeTrustedFilePr(input),
    officerIdentity,
    consumeRateLimit: (userId) =>
      consumeRateLimit({
        scope: "docs:pr",
        subjectId: userId,
        limit: PRS_PER_HOUR,
        windowSeconds: 3600,
      }),
    credentials: () =>
      configPrsAvailable()
        ? {
            appId: env.GH_CONFIG_APP_ID!,
            privateKey: env.GH_CONFIG_APP_PRIVATE_KEY!,
          }
        : null,
    repo: { owner: env.GITHUB_ORG, name: CONFIG_REPO },
    staging: isStagingPr,
    bundledSlugs: () => getDocsProjects().map((project) => project.slug),
    newId: () => crypto.randomUUID(),
  };
}
