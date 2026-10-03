import type {
  HandleOption,
  HandleOptionKind,
} from "~/server/loaders/publicProfiles";
import type { SetHandleOutcome } from "~/server/actions/profileHandle";
import { profilePath } from "./profilePath";

/**
 * How the handle picker words things. Kept apart from the component so the
 * copy can be tested without rendering, and so the picker and any later
 * surface describe a handle the same way.
 */

export const HANDLE_KIND_LABELS: Record<HandleOptionKind, string> = {
  github: "GitHub username",
  discord: "Discord username",
  myid: "MyID",
  legal_full: "Legal name",
  legal_initial: "Legal name, last initial",
  preferred_full: "Preferred name",
  preferred_initial: "Preferred name, last initial",
  suffixed: "Numbered",
};

export function handleKindLabel(kind: HandleOptionKind): string {
  return HANDLE_KIND_LABELS[kind];
}

/**
 * Picking one of these publishes a username from a connected account. The
 * handle is part of the URL, so the account's own "show on profile" switch
 * does not hide it.
 */
export function revealsConnectedUsername(kind: HandleOptionKind): boolean {
  return kind === "github" || kind === "discord";
}

/** The URL path a handle would live at, as shown beside each option. */
export function handleUrlPath(option: Pick<HandleOption, "handle">): string {
  return profilePath(option.handle);
}

export interface HandleOutcomeMessage {
  tone: "success" | "warning" | "critical";
  message: string;
  /** The options may have changed under the member, so re-read them. */
  refresh: boolean;
}

/**
 * Every `setHandle` outcome as inline copy. Nothing here throws or routes to
 * an error page: a stale list, a lost race and a rate limit are all things a
 * member does in the ordinary course of choosing.
 */
export function describeHandleOutcome(
  outcome: SetHandleOutcome,
): HandleOutcomeMessage {
  switch (outcome.status) {
    case "set":
      return {
        tone: "success",
        message: `Your handle is now @${outcome.handle}.`,
        refresh: false,
      };
    case "taken":
      return {
        tone: "warning",
        message: "That handle was just taken. Pick another.",
        refresh: true,
      };
    case "not_offered":
      return {
        tone: "warning",
        message:
          "That handle is no longer one of your options. The list has been refreshed; pick again.",
        refresh: true,
      };
    case "blocked":
      return {
        tone: "critical",
        message:
          "Your profile is locked, so the handle cannot be changed right now. Contact an officer if you think this is a mistake.",
        refresh: false,
      };
    case "no_profile":
      return {
        tone: "critical",
        message:
          "We could not find your profile. Reload the page and try again.",
        refresh: false,
      };
    case "rate_limited":
      return {
        tone: "warning",
        message:
          "You have changed your handle a lot in a short time. Wait a few minutes and try again.",
        refresh: false,
      };
  }
}
