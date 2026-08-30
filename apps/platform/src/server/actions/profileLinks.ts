"use server";

import { count, eq, max } from "drizzle-orm";
import ogs from "open-graph-scraper";
import * as z from "zod";
import * as zfd from "zod-form-data";
import { authenticate, expectSession } from "../auth";
import { db } from "../db";
import { profileLinks } from "../db/schema";
import {
  isValidLinkUrl,
  linkTitleSchema,
  PROFILE_LIMITS,
} from "~/lib/validation/profile";

export type AddLinkResult = {
  link?: typeof profileLinks.$inferSelect;
  error?: string;
};

// `title` used to be capped at 100 here while the column is varchar(64), so a
// title between the two passed validation and then blew up on the insert. Both
// this and the input now read the limit from ~/lib/validation/profile.
const schema = zfd.formData({
  url: zfd.text(z.url()),
  title: zfd.text(linkTitleSchema.optional()),
  sortOrder: zfd.numeric(z.number().optional()),
});

export default async function addProfileLink(
  formData: FormData,
): Promise<AddLinkResult> {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/account"),
  );

  const parsed = await schema.safeParseAsync(formData);
  if (!parsed.success) return { error: "Invalid URL." };

  const {
    url,
    title: suppliedTitle,
    sortOrder: suppliedSortOrder,
  } = parsed.data;
  if (!isValidLinkUrl(url)) {
    return { error: "Enter a full http:// or https:// URL." };
  }
  const { hostname } = new URL(url);

  return db.transaction(async (tx) => {
    const [countRow] = await tx
      .select({ linkCount: count(), maxOrder: max(profileLinks.sortOrder) })
      .from(profileLinks)
      .where(eq(profileLinks.userId, userId));

    if ((countRow?.linkCount ?? 0) >= PROFILE_LIMITS.linkCount) {
      return {
        error: `You can only add up to ${PROFILE_LIMITS.linkCount} links.`,
      };
    }

    const sortOrder = suppliedSortOrder ?? (countRow?.maxOrder ?? 0) + 1;

    // OG title fetching must stay server-side. Browsers block cross-origin
    // HTML fetches (CORS) unless the target sets Access-Control-Allow-Origin,
    // which almost no site does on its HTML pages.
    //
    // The fetch is OURS, with ogs only parsing the `html`. Given a bare `url`,
    // ogs fetches through undici, whose first request compiles the llhttp
    // parser's Wasm, and the Workers runtime forbids runtime Wasm codegen (the
    // same failure DocsMarkdown hit with Shiki's Oniguruma engine). The
    // platform-native fetch needs no parser.
    let title: string | null = suppliedTitle ?? null;
    if (!title) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: { Accept: "text/html" },
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (response.ok && contentType.includes("text/")) {
          const { result } = await ogs({ html: await response.text() });
          title = result.ogTitle ?? result.dcTitle ?? null;
        }
      } catch {
        // fall through to hostname fallback
      }
    }

    // An OG title is whatever the page put in its <head> and is routinely
    // longer than the varchar(64) column. Nobody validated it, because nobody
    // typed it, so a good link could fail to save on account of someone else's
    // markup. Truncate instead of refusing.
    const resolved =
      title ?? hostname.charAt(0).toUpperCase() + hostname.slice(1);

    const [inserted] = await tx
      .insert(profileLinks)
      .values({
        userId,
        url,
        title: resolved.slice(0, PROFILE_LIMITS.linkTitle),
        sortOrder,
      })
      .returning();

    if (!inserted) return { error: "Failed to save link." };

    return { link: inserted };
  });
}
