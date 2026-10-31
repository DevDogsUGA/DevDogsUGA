"use server";

import {
  expected,
  ExpectedFailure,
  type ActionResult,
} from "~/lib/actionResult";

import { authorize, authorizeSession, rules } from "~/server/auth/access";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import * as z from "zod";
import { normalizeShortText } from "~/lib/shortText";
import {
  bioSchema,
  PROFILE_LIMITS,
  preferredNameSchema,
  pronounsSchema,
  roleDescriptionSchema,
  validateLinkCount,
  validateLinks,
} from "~/lib/validation/profile";
import { db } from "~/server/db";
import { profileLinks, profiles } from "~/server/db/schema";
import { revalidateOfficers } from "~/server/loaders/officers";
import { resolveLinkTitle } from "~/server/profileLinkTitle";

/**
 * The /dashboard/profile fields that used to write `platform.profile` and
 * `platform."profileLinks"` straight from the browser. Each action saves one
 * field group, acts only on the caller's own row, and checks the same rules the
 * field checks on blur, from ~/lib/validation/profile.
 *
 * This connection bypasses RLS, so the policy the browser ran under is restated
 * in each write: a quarantined (frozen) or suspended member's profile is
 * refused. `fieldErrors` are keyed by the ids the page registers its fields
 * under, so the save bar can put each message under the right field.
 *
 * Only an officer's edit can change the homepage board, so only an officer's
 * save invalidates it; anyone else's would be a way to make the homepage
 * rebuild on demand.
 */

const LOCKED = "This profile can't be edited right now.";

/** The caller's own row, unless RLS would have refused them. */
function ownEditableProfile(userId: string) {
  return and(
    eq(profiles.userId, userId),
    isNull(profiles.quarantinedBy),
    sql`not platform.is_suspended(${userId})`,
  );
}

/**
 * Runs each field that was sent through its shared schema. Refuses with the
 * first message and, in `fieldErrors`, every message keyed by field id.
 */
function validated<S extends Record<string, z.ZodType>>(
  schemas: S,
  input: { [K in keyof S]?: unknown },
): { [K in keyof S]?: z.output<S[K]> } {
  const values: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  for (const [id, schema] of Object.entries(schemas)) {
    const value = (input as Record<string, unknown> | null)?.[id];
    if (value === undefined) continue;
    const parsed = schema.safeParse(value);
    if (parsed.success) values[id] = parsed.data;
    else
      fieldErrors[id] =
        parsed.error.issues[0]?.message ?? "Enter a valid value.";
  }
  const first = Object.values(fieldErrors)[0];
  if (first) throw new ExpectedFailure(first, fieldErrors);
  return values as { [K in keyof S]?: z.output<S[K]> };
}

export interface IdentityInput {
  preferredName?: string;
  pronouns?: string[];
}

/**
 * Saves the preferred name, the pronouns, or both; a field that is left out is
 * left alone. Returns what was written, with the name trimmed.
 */
export async function updateIdentity(
  input: IdentityInput,
): Promise<ActionResult<IdentityInput>> {
  return expected(async () => {
    const access = await authorizeSession();
    if (!access.ok) throw new ExpectedFailure(access.message);
    const { caller } = access;

    const values = validated(
      { preferredName: preferredNameSchema, pronouns: pronounsSchema },
      input,
    );
    const saved: IdentityInput = {
      ...(values.preferredName === undefined
        ? {}
        : { preferredName: values.preferredName.trim() }),
      ...(values.pronouns === undefined ? {} : { pronouns: values.pronouns }),
    };
    if (Object.keys(saved).length === 0) return saved;

    const [row] = await db
      .update(profiles)
      .set(saved)
      .where(ownEditableProfile(caller.userId))
      .returning({ userId: profiles.userId });
    if (!row) throw new ExpectedFailure(LOCKED);

    if (rules.officer(caller)) revalidateOfficers();
    return saved;
  });
}

/** Saves the bio, normalised the way the field shows it. Returns what was written. */
export async function updateBio(bio: string): Promise<ActionResult<string>> {
  return expected(async () => {
    const access = await authorizeSession();
    if (!access.ok) throw new ExpectedFailure(access.message);
    const { caller } = access;

    const { bio: raw } = validated({ bio: bioSchema }, { bio });
    const normalized = normalizeShortText(raw ?? "");

    const [row] = await db
      .update(profiles)
      .set({ bio: normalized || null })
      .where(ownEditableProfile(caller.userId))
      .returning({ userId: profiles.userId });
    if (!row) throw new ExpectedFailure(LOCKED);

    // The bio is not on the homepage board, so nothing is revalidated.
    return normalized;
  });
}

/**
 * Saves the role description, the officer bio the homepage Leadership section
 * prints. Officers only: the column is editable by anyone, but only a
 * leadership role surfaces it. Returns what was written.
 */
export async function updateRoleDescription(
  roleDescription: string,
): Promise<ActionResult<string>> {
  return expected(async () => {
    const access = await authorize(rules.officer);
    if (!access.ok) throw new ExpectedFailure(access.message);
    const { caller } = access;

    const { roleDescription: raw } = validated(
      { roleDescription: roleDescriptionSchema },
      { roleDescription },
    );
    const trimmed = (raw ?? "").trim();

    const [row] = await db
      .update(profiles)
      .set({ roleDescription: trimmed || null })
      .where(ownEditableProfile(caller.userId))
      .returning({ userId: profiles.userId });
    if (!row) throw new ExpectedFailure(LOCKED);

    revalidateOfficers();
    return trimmed;
  });
}

type ProfileLink = typeof profileLinks.$inferSelect;

/**
 * What a links save changes, as the page staged it: ids to delete, links to
 * rewrite, links to create. `sortOrder` is a double, so a link moved between
 * two neighbours takes their midpoint and nothing else needs renumbering.
 */
export interface ProfileLinkChanges {
  remove: string[];
  update: {
    id: string;
    url: string;
    title: string | null;
    sortOrder: number;
  }[];
  add: { url: string; title: string | null; sortOrder: number }[];
}

const linkChangesSchema = z.object({
  remove: z.array(z.uuid()).max(PROFILE_LIMITS.linkCount),
  update: z
    .array(
      z.object({
        id: z.uuid(),
        url: z.string(),
        title: z.string().nullable(),
        sortOrder: z.number(),
      }),
    )
    .max(PROFILE_LIMITS.linkCount),
  add: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().nullable(),
        sortOrder: z.number(),
      }),
    )
    .max(PROFILE_LIMITS.linkCount),
});

const STALE_LINKS = "Your links changed somewhere else. Reload and try again.";

/**
 * Saves the staged links in one transaction: either every change lands or
 * none does, so a refused save leaves the list as it was. Returns the saved
 * list in order, for the page to adopt as its baseline.
 *
 * The final list is checked as a whole (count, addresses, titles), the way the
 * page checks it, and its positions must be distinct. Titles are blank or
 * trimmed text; a new link with none takes the page's own title, fetched
 * before the transaction so the profile row is not locked for the fetch.
 */
export async function updateProfileLinks(
  changes: ProfileLinkChanges,
): Promise<ActionResult<ProfileLink[]>> {
  return expected(async () => {
    const access = await authorizeSession();
    if (!access.ok) throw new ExpectedFailure(access.message);
    const { caller } = access;
    const { userId } = caller;

    const parsed = linkChangesSchema.safeParse(changes);
    if (!parsed.success) {
      throw new ExpectedFailure("Those links could not be read.", {
        links: "Those links could not be read.",
      });
    }
    const { remove, update, add } = parsed.data;
    const refuse = (message: string): never => {
      throw new ExpectedFailure(message, { links: message });
    };

    const titled = (link: { title: string | null }) => {
      const trimmed = link.title?.trim();
      return trimmed === undefined || trimmed === "" ? null : trimmed;
    };
    const listError = validateLinks([
      ...update.map((l) => ({ url: l.url, title: titled(l) })),
      ...add.map((l) => ({ url: l.url, title: titled(l) })),
    ]);
    if (listError) refuse(listError);

    const newTitles = await Promise.all(
      add.map((link) => resolveLinkTitle(link.url, titled(link))),
    );

    const saved = await db.transaction(async (tx) => {
      // Locks the row, so two saves from one member run one after the other,
      // and answers the frozen and suspended checks RLS made in the browser.
      const [status] = await tx
        .select({
          frozen: sql<boolean>`platform.is_profile_frozen(${userId})`,
          suspended: sql<boolean>`platform.is_suspended(${userId})`,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .for("update");
      if (!status) throw new ExpectedFailure("Profile not found.");
      if (status.frozen || status.suspended) throw new ExpectedFailure(LOCKED);

      const existing = await tx
        .select()
        .from(profileLinks)
        .where(eq(profileLinks.userId, userId));
      const owned = new Set(existing.map((l) => l.id));
      if (![...remove, ...update.map((l) => l.id)].every((id) => owned.has(id)))
        refuse(STALE_LINKS);

      const updates = new Map(update.map((l) => [l.id, l]));
      const survivors = existing.filter((l) => !remove.includes(l.id));
      const final = [
        ...survivors.map((l) => updates.get(l.id)?.sortOrder ?? l.sortOrder),
        ...add.map((l) => l.sortOrder),
      ];
      const countError = validateLinkCount(final.length);
      if (countError) refuse(countError);
      if (new Set(final).size !== final.length)
        refuse("Two links share a position. Reload and try again.");

      if (remove.length > 0) {
        await tx
          .delete(profileLinks)
          .where(
            and(
              eq(profileLinks.userId, userId),
              inArray(profileLinks.id, remove),
            ),
          );
      }

      // The (userId, sortOrder) index is checked row by row, so two links
      // trading positions would collide on the way. Park the rewritten links
      // past every position in use, then write their real ones.
      if (update.length > 0) {
        const parking =
          Math.max(...existing.map((l) => l.sortOrder), ...final) + 1;
        for (const [i, link] of update.entries()) {
          await tx
            .update(profileLinks)
            .set({ sortOrder: parking + i })
            .where(
              and(
                eq(profileLinks.userId, userId),
                eq(profileLinks.id, link.id),
              ),
            );
        }
        for (const link of update) {
          await tx
            .update(profileLinks)
            .set({
              url: link.url,
              title: (titled(link) ?? new URL(link.url).hostname).slice(
                0,
                PROFILE_LIMITS.linkTitle,
              ),
              sortOrder: link.sortOrder,
            })
            .where(
              and(
                eq(profileLinks.userId, userId),
                eq(profileLinks.id, link.id),
              ),
            );
        }
      }

      if (add.length > 0) {
        await tx.insert(profileLinks).values(
          add.map((link, i) => ({
            userId,
            url: link.url,
            title: newTitles[i]!,
            sortOrder: link.sortOrder,
          })),
        );
      }

      return tx
        .select()
        .from(profileLinks)
        .where(eq(profileLinks.userId, userId))
        .orderBy(asc(profileLinks.sortOrder));
    });

    if (rules.officer(caller)) revalidateOfficers();
    return saved;
  });
}
