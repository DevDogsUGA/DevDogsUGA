"use server";

import {
  expected,
  ExpectedFailure,
  failure,
  success,
  type ActionResult,
} from "~/lib/actionResult";
import { authorize, rules } from "~/server/auth/access";

import {
  getAuthoredFiles,
  MEETING_SLUG_PATTERN,
  SERIES_ID_PATTERN,
} from "@devdogsuga/events";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  FIELDS,
  isCollection,
  parseItem,
  type Collection,
} from "~/server/config/editFields";
import {
  changedFields,
  findItem,
  keyField,
  type AuthoredConfig,
} from "~/server/config/edits";
import { resetAllEdits, resetEdit, saveEdit } from "~/server/config/editsStore";
import { openConfigPr } from "~/server/config/proposals";

/**
 * The schedule editor's actions. Every one re-checks that the caller is an
 * officer: the page gates on it too, but an action is a public endpoint.
 * Saved edits are the officer's own and unpublished; only `openConfigPrAction`
 * leaves the platform.
 */

const FORBIDDEN_MESSAGE = "Only officers can propose schedule changes.";

const collectionSchema = z.string().refine(isCollection);

function refresh(collection?: Collection, key?: string) {
  revalidatePath("/dashboard/schedule");
  if (collection && key) {
    revalidatePath(`/dashboard/schedule/${collection}/${key}`);
  }
}

function keyProblem(collection: Collection, key: string): string | null {
  if (key === "new") return "That id is reserved.";
  if (collection === "meeting") {
    return MEETING_SLUG_PATTERN.test(key)
      ? null
      : "The slug must be the Eastern date, optionally with a lowercase descriptor (2026-10-05-judging).";
  }
  return SERIES_ID_PATTERN.test(key)
    ? null
    : "The id must be lowercase words joined by hyphens.";
}

/** What the item form sends: the collection, the item's key and each field's text. */
export interface ConfigEditInput {
  collection: string;
  key: string;
  isNew: boolean;
  /** Field name to the text in its control. */
  values: Record<string, string>;
}

/**
 * Saves the item form's Draft. Only the fields that differ from the official
 * config are stored. Every shape problem comes back at once, keyed by field
 * name, so the form can put each under its own control. `data.cleared` is true
 * when nothing differs any more, and the saved edit is gone.
 */
export async function saveConfigEditAction(
  input: ConfigEditInput,
): Promise<ActionResult<{ cleared: boolean }>> {
  const access = await authorize(rules.officer);
  if (!access.ok) return failure(FORBIDDEN_MESSAGE);
  const userId = access.caller.userId;
  if (!userId) return failure(FORBIDDEN_MESSAGE);

  const collection = collectionSchema.safeParse(input.collection);
  if (!collection.success) return failure("Unknown item type.");
  const kind = collection.data;

  const outcome = await expected(async () => {
    const isNew = input.isNew === true;
    const submitted: Record<string, string> = {};
    for (const field of FIELDS[kind]) {
      const value = input.values?.[field.name];
      if (typeof value === "string")
        submitted[field.name] = value.slice(0, 5000);
    }
    const keyName = keyField(kind);
    const key = isNew
      ? (submitted[keyName] ?? "").trim()
      : typeof input.key === "string"
        ? input.key
        : "";
    const problem = keyProblem(kind, key);
    if (problem) throw new ExpectedFailure(problem, { [keyName]: problem });
    submitted[keyName] = key;

    const official = getAuthoredFiles() as unknown as AuthoredConfig;
    const existing = findItem(official, kind, key);
    if (isNew && existing) {
      const message = `A ${kind} with that ${keyName} already exists.`;
      throw new ExpectedFailure(message, { [keyName]: message });
    }
    if (!isNew && !existing) {
      throw new ExpectedFailure(
        `That ${kind} is not in the official config any more. Reset it.`,
      );
    }

    const parsed = parseItem(kind, submitted);
    if (parsed.errors.length > 0) {
      throw new ExpectedFailure(parsed.errors[0]!, parsed.fieldErrors);
    }
    // A venue's `verified` details are not editable here; carry them over.
    if (existing && "verified" in existing) {
      parsed.item.verified = existing.verified;
    }
    const fields = changedFields(kind, existing, parsed.item);
    delete fields[keyName];

    // The table refuses more than 16 KB of saved fields; say so rather than
    // letting the check violation surface as a server error.
    if (new TextEncoder().encode(JSON.stringify(fields)).length > 15_000) {
      throw new ExpectedFailure(
        "This edit is too long to save. Shorten the longer fields.",
      );
    }
    const result = await saveEdit(userId, {
      collection: kind,
      key,
      isNew,
      fields,
    });
    refresh(kind, key);
    if (result === "too_many") {
      throw new ExpectedFailure(
        "You have too many saved edits. Reset some first.",
      );
    }
    return { cleared: result === "cleared" };
  });
  if (!outcome.ok) return outcome;
  return success(
    outcome.data,
    outcome.data?.cleared
      ? "No differences from the official config, so nothing is saved."
      : "Saved. Only you see this until you open a pull request.",
  );
}

/** Resets one saved edit to the official config. A Command on the item page and the orphan list. */
export async function resetConfigEditAction(
  collection: string,
  key: string,
): Promise<ActionResult> {
  const access = await authorize(rules.officer);
  if (!access.ok) return failure(FORBIDDEN_MESSAGE);

  const kind = collectionSchema.safeParse(collection);
  const name = z.string().min(1).max(120).safeParse(key);
  if (!kind.success || !name.success)
    return failure("That request is invalid.");
  const userId = access.caller.userId;
  if (!userId) return failure(FORBIDDEN_MESSAGE);
  await resetEdit(userId, kind.data, name.data);
  refresh(kind.data, name.data);
  return success(undefined, "Reset to official.");
}

/** Resets every saved edit the officer has. A Command beside Open PR. */
export async function resetAllConfigEditsAction(): Promise<ActionResult> {
  const access = await authorize(rules.officer);
  if (!access.ok) return failure(FORBIDDEN_MESSAGE);

  const userId = access.caller.userId;
  if (!userId) return failure(FORBIDDEN_MESSAGE);
  const n = await resetAllEdits(userId);
  refresh();
  return success(
    undefined,
    n === 0 ? "Nothing to reset." : "Everything is back to official.",
  );
}

const OPEN_MESSAGES = {
  forbidden: FORBIDDEN_MESSAGE,
  unavailable:
    "Opening pull requests is not set up in this environment. Your saved edits and the diff still work.",
  rate_limited:
    "You have made three pull request attempts in the last hour. Try again later.",
  nothing_to_propose: "Nothing differs from the official config.",
} as const;

/**
 * Opens the officer's saved edits as a pull request. Success carries the link
 * in `data.url`, which the editor keeps on screen. When the proposal fails the
 * config checks, the failures come back in `fieldErrors`, keyed by their
 * position ("0", "1", …), so the editor can list every one.
 */
export async function openConfigPrAction(): Promise<
  ActionResult<{ url: string }>
> {
  const access = await authorize(rules.officer);
  if (!access.ok) return failure(FORBIDDEN_MESSAGE);

  const userId = access.caller.userId;
  const result = await openConfigPr(userId);
  if (result.status === "opened") {
    refresh();
    return success(
      { url: result.url },
      result.draft
        ? "Opened a draft pull request (staging)."
        : "Opened a pull request. Review and merging happen on GitHub.",
    );
  }
  if (result.status === "invalid") {
    return failure(
      "This proposal does not pass the config checks, so no pull request was opened.",
      Object.fromEntries(result.errors.map((error, i) => [String(i), error])),
    );
  }
  if (result.status === "github_error") {
    return failure(
      `GitHub refused the request, so no pull request was opened. (${result.message})`,
    );
  }
  return failure(OPEN_MESSAGES[result.status]);
}
