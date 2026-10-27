"use server";

import {
  getAuthoredFiles,
  MEETING_SLUG_PATTERN,
  SERIES_ID_PATTERN,
} from "@devdogsuga/events";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expectSession } from "~/server/auth";
import { isOfficer } from "~/server/actions/permissions";
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

export interface ConfigActionState {
  ok: boolean;
  message: string;
  url?: string;
  errors?: string[];
}

const FORBIDDEN: ConfigActionState = {
  ok: false,
  message: "Only officers can propose schedule changes.",
};

const collectionSchema = z.string().refine(isCollection);

function refresh(collection?: Collection, key?: string) {
  revalidatePath("/console/meetings");
  if (collection && key) {
    revalidatePath(`/console/meetings/${collection}/${key}`);
  }
}

async function officerId(): Promise<string | null> {
  const userId = await expectSession();
  return (await isOfficer(userId)) ? userId : null;
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

export async function saveConfigEditAction(
  _previous: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  const collection = collectionSchema.safeParse(formData.get("collection"));
  if (!collection.success) return { ok: false, message: "Unknown item type." };
  const kind = collection.data;
  const userId = await officerId();
  if (!userId) return FORBIDDEN;

  const isNew = formData.get("isNew") === "1";
  const submitted: Record<string, string> = {};
  for (const field of FIELDS[kind]) {
    const value = formData.get(`f_${field.name}`);
    if (typeof value === "string") submitted[field.name] = value.slice(0, 5000);
  }
  const keyName = keyField(kind);
  const key = isNew
    ? (submitted[keyName] ?? "").trim()
    : typeof formData.get("key") === "string"
      ? (formData.get("key") as string)
      : "";
  const problem = keyProblem(kind, key);
  if (problem) return { ok: false, message: problem };
  submitted[keyName] = key;

  const official = getAuthoredFiles() as unknown as AuthoredConfig;
  const existing = findItem(official, kind, key);
  if (isNew && existing) {
    return {
      ok: false,
      message: `A ${kind} with that ${keyName} already exists.`,
    };
  }
  if (!isNew && !existing) {
    return {
      ok: false,
      message: `That ${kind} is not in the official config any more. Reset it.`,
    };
  }

  const parsed = parseItem(kind, submitted);
  if (parsed.errors.length > 0) {
    return { ok: false, message: parsed.errors[0]!, errors: parsed.errors };
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
    return {
      ok: false,
      message: "This edit is too long to save. Shorten the longer fields.",
    };
  }
  const result = await saveEdit(userId, {
    collection: kind,
    key,
    isNew,
    fields,
  });
  refresh(kind, key);
  if (result === "too_many") {
    return {
      ok: false,
      message: "You have too many saved edits. Reset some first.",
    };
  }
  return {
    ok: true,
    message:
      result === "cleared"
        ? "No differences from the official config, so nothing is saved."
        : "Saved. Only you see this until you open a pull request.",
  };
}

export async function resetConfigEditAction(
  _previous: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  const collection = collectionSchema.safeParse(formData.get("collection"));
  const key = z.string().min(1).max(120).safeParse(formData.get("key"));
  if (!collection.success || !key.success) {
    return { ok: false, message: "That request is invalid." };
  }
  const userId = await officerId();
  if (!userId) return FORBIDDEN;
  await resetEdit(userId, collection.data, key.data);
  refresh(collection.data, key.data);
  return { ok: true, message: "Reset to official." };
}

export async function resetAllConfigEditsAction(): Promise<ConfigActionState> {
  const userId = await officerId();
  if (!userId) return FORBIDDEN;
  const n = await resetAllEdits(userId);
  refresh();
  return {
    ok: true,
    message: n === 0 ? "Nothing to reset." : "Everything is back to official.",
  };
}

const OPEN_MESSAGES = {
  forbidden: FORBIDDEN.message,
  unavailable:
    "Opening pull requests is not set up in this environment. Your saved edits and the diff still work.",
  rate_limited:
    "You have made three pull request attempts in the last hour. Try again later.",
  nothing_to_propose: "Nothing differs from the official config.",
} as const;

export async function openConfigPrAction(): Promise<ConfigActionState> {
  const userId = await expectSession();
  const result = await openConfigPr(userId);
  if (result.status === "opened") {
    refresh();
    return {
      ok: true,
      message: result.draft
        ? "Opened a draft pull request (staging)."
        : "Opened a pull request. Review and merging happen on GitHub.",
      url: result.url,
    };
  }
  if (result.status === "invalid") {
    return {
      ok: false,
      message:
        "This proposal does not pass the config checks, so no pull request was opened.",
      errors: result.errors,
    };
  }
  if (result.status === "github_error") {
    return {
      ok: false,
      message: `GitHub refused the request, so no pull request was opened. (${result.message})`,
    };
  }
  return { ok: false, message: OPEN_MESSAGES[result.status] };
}
