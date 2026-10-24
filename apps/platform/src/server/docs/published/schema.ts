import * as z from "zod";

/**
 * What the docs-publishing job writes to the bucket, as the platform reads it.
 *
 * The shapes mirror `CandidateContent` and `SearchEntry` in
 * `packages/docs-kit/src/candidate.ts` and `pointerOf` in
 * `.github/scripts/docs-publish.mjs`. They are re-stated here, with limits,
 * rather than imported: the bucket is a trust boundary (the platform reads
 * bytes a project's maintainers influenced, after a reviewer approved them),
 * so a field that is missing, mistyped or absurdly large is a version the
 * platform does not show, not one it half-renders.
 */

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const MAX_PAGES = 300;
const MAX_PATH = 200;
const MAX_HTML = 2 * 1024 * 1024;

const projectRelative = (slug: string) =>
  z
    .string()
    .max(MAX_PATH)
    .refine((path) => path.startsWith(`${slug}/`) || path === slug, {
      message: `path must be under ${slug}/`,
    });

export const pointerSchema = z.object({
  version: z.literal(1),
  project: z.string().regex(SLUG_PATTERN),
  digest: z.string().regex(DIGEST_PATTERN),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  repository: z.string().max(200),
  destination: z.string().max(200),
  publishedAt: z.string().max(40),
});
export type PublishedPointer = z.infer<typeof pointerSchema>;

const headingSchema = z.object({
  id: z.string().max(300),
  title: z.string().max(500),
  depth: z.number().int().min(1).max(6),
});

export function contentSchema(slug: string) {
  return z.object({
    version: z.literal(1),
    project: z.object({
      slug: z.literal(slug),
      name: z.string().max(200),
      description: z.string().max(2000).nullable(),
      order: z.number().nullable(),
      os: z.array(z.string().max(40)).max(8),
    }),
    folders: z
      .array(
        z.object({
          path: projectRelative(slug),
          name: z.string().max(200),
          description: z.string().max(2000).nullable(),
          order: z.number().nullable(),
          steps: z.boolean(),
        }),
      )
      .max(MAX_PAGES),
    assets: z
      .array(
        z.object({
          path: z.string().max(MAX_PATH),
          type: z.string().max(60),
          bytes: z.number().int().nonnegative(),
          sha256: z.string().regex(DIGEST_PATTERN),
        }),
      )
      .max(MAX_PAGES),
    pages: z
      .array(
        z.object({
          path: projectRelative(slug),
          title: z.string().max(500),
          description: z.string().max(2000).nullable(),
          order: z.number().nullable(),
          section: z
            .enum(["getting-started", "guides", "infrastructure", "reference"])
            .nullable(),
          headings: z.array(headingSchema).max(500),
          html: z.string().max(MAX_HTML),
        }),
      )
      .max(MAX_PAGES),
  });
}
export type PublishedContent = z.infer<ReturnType<typeof contentSchema>>;

export const searchSchema = z
  .array(
    z.object({
      path: z.string().max(MAX_PATH),
      title: z.string().max(500),
      description: z.string().max(2000).nullable(),
      plainText: z.string().max(MAX_HTML),
    }),
  )
  .max(MAX_PAGES);
export type PublishedSearchEntry = z.infer<typeof searchSchema>[number];
