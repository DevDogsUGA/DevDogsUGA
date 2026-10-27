import {
  parseFailureQuery,
  retryUrl,
  SIGN_IN_FAILURE_COPY,
} from "~/server/auth/signInFailure";
import { SITE } from "@devdogsuga/newsletter";
import { page, PUBLIC, terminal } from "../define";
import type { Block } from "../blocks";

/**
 * The sign-in recovery page. The terminal can't sign anyone in, so it says
 * what happened, the reference if there is one, and where to retry in a
 * browser.
 */
export const signInProblem = terminal(PUBLIC, ({ search }) => {
  const { failure, returnTo, ref } = parseFailureQuery({
    reason: search.get("reason") ?? undefined,
    returnTo: search.get("returnTo") ?? undefined,
    ref: search.get("ref") ?? undefined,
  });
  const copy = SIGN_IN_FAILURE_COPY[failure];
  const body: Block[] = [
    {
      type: "notice",
      notice: {
        tone: failure === "cancelled" ? "warn" : "error",
        title: copy.title,
        text: copy.body,
        url: `${SITE}${retryUrl(returnTo)}`,
      },
    },
  ];
  if (ref)
    body.push({ type: "fields", rows: [{ label: "reference", value: ref }] });
  return page({
    banner: "DEVDOGS",
    accent: "rose",
    aside: ["sign-in"],
    command: "auth --status",
    body,
  });
});
