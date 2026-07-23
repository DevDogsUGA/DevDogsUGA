"use server";

import { count, eq, max } from "drizzle-orm";
import ogs from "open-graph-scraper";
import * as z from "zod";
import * as zfd from "zod-form-data";
import { authenticate, expectSession } from "../auth";
import { db } from "../db";
import { profileLinks } from '../db/schema';

export type AddLinkResult = {
  link?: typeof profileLinks.$inferSelect;
  error?: string;
};

const schema = zfd.formData({
  url: zfd.text(z.url()),
  title: zfd.text(z.string().max(100).optional()),
  sortOrder: zfd.numeric(z.number().optional()),
});

export default async function addProfileLink(
  formData: FormData,
): Promise<AddLinkResult> {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/console/profile"),
  );

  const parsed = await schema.safeParseAsync(formData);
  if (!parsed.success) return { error: "Invalid URL." };

  const {
    url,
    title: suppliedTitle,
    sortOrder: suppliedSortOrder,
  } = parsed.data;
  const { protocol, hostname } = new URL(url);

  if (protocol !== "http:" && protocol !== "https:") {
    return { error: "Only http and https URLs are supported." };
  }

  return db.transaction(async (tx) => {
    const [countRow] = await tx
      .select({ linkCount: count(), maxOrder: max(profileLinks.sortOrder) })
      .from(profileLinks)
      .where(eq(profileLinks.userId, userId));

    if ((countRow?.linkCount ?? 0) >= 5) {
      return { error: "You can only add up to 5 links." };
    }

    const sortOrder = suppliedSortOrder ?? (countRow?.maxOrder ?? 0) + 1;

    // OG title fetching must remain server-side. Browsers block cross-origin
    // HTML fetches (CORS) unless the target sets Access-Control-Allow-Origin,
    // which almost no site does on its HTML pages.
    let title: string | null = suppliedTitle ?? null;
    if (!title) {
      try {
        const { result } = await ogs({ url, timeout: 5000 });
        title = result.ogTitle ?? result.dcTitle ?? null;
      } catch {
        // fall through to hostname fallback
      }
    }

    const [inserted] = await tx
      .insert(profileLinks)
      .values({
        userId,
        url,
        title: title ?? hostname.charAt(0).toUpperCase() + hostname.slice(1),
        sortOrder,
      })
      .returning();

    if (!inserted) return { error: "Failed to save link." };

    return { link: inserted };
  });
}
