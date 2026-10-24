import type { DocsBucket } from "./bucket";
import type { PublishedContent, PublishedPointer } from "./schema";

/** Test helpers: an in-memory R2 and a small valid publication. Not imported by app code. */

export const DIGEST = "a".repeat(64);
export const OTHER_DIGEST = "b".repeat(64);

export function fakeBucket(
  objects: Record<string, string | Uint8Array>,
): DocsBucket & { reads: string[]; keys: () => string[] } {
  const reads: string[] = [];
  const bytesOf = (value: string | Uint8Array) =>
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return {
    reads,
    keys: () => Object.keys(objects),
    async get(key) {
      reads.push(key);
      const value = objects[key];
      if (value === undefined) return null;
      const bytes = bytesOf(value);
      return {
        size: bytes.byteLength,
        text: async () => new TextDecoder().decode(bytes),
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
      };
    },
    async list({ prefix = "", delimiter }) {
      const prefixes = new Set<string>();
      const found: { key: string }[] = [];
      for (const key of Object.keys(objects)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = delimiter ? rest.indexOf(delimiter) : -1;
        if (slash === -1) found.push({ key });
        else prefixes.add(prefix + rest.slice(0, slash + 1));
      }
      return {
        objects: found,
        delimitedPrefixes: [...prefixes],
        truncated: false,
      };
    },
  };
}

export function pointer(
  slug = "demo",
  digest = DIGEST,
  extra: Partial<PublishedPointer> = {},
): PublishedPointer {
  return {
    version: 1,
    project: slug,
    digest,
    sha: "c".repeat(40),
    repository: `DevDogsUGA/${slug}`,
    destination: `/docs/${slug}`,
    publishedAt: "2026-10-24T12:00:00.000Z",
    ...extra,
  };
}

export function content(slug = "demo"): PublishedContent {
  const page = (
    rel: string,
    title: string,
    html: string,
    extra: Partial<PublishedContent["pages"][number]> = {},
  ): PublishedContent["pages"][number] => ({
    path: `${slug}/${rel}`,
    title,
    description: null,
    order: null,
    section: rel === "index" ? null : "guides",
    headings: [],
    html,
    ...extra,
  });
  return {
    version: 1,
    project: {
      slug,
      name: "Demo",
      description: "A demo project.",
      order: null,
      os: ["macos", "linux", "wsl"],
    },
    folders: [],
    assets: [
      { path: "pic.svg", type: "image/svg+xml", bytes: 10, sha256: DIGEST },
      { path: "img/shot.png", type: "image/png", bytes: 10, sha256: DIGEST },
    ],
    pages: [
      page(
        "index",
        "Demo",
        '<h1 id="pd-demo--demo">Demo</h1><p><img src="pic.svg" alt="pic"></p>',
        { description: "A demo project." },
      ),
      page(
        "guide/start",
        "Start here",
        '<p>See <a href="/docs/demo">home</a>. <img src="../img/shot.png" alt="shot"></p>',
      ),
    ],
  };
}

export const searchEntries = (slug = "demo") => [
  {
    path: `${slug}/index`,
    title: "Demo",
    description: "A demo project.",
    plainText: "Demo\n\nHello world, welcome to the demo.",
  },
  {
    path: `${slug}/guide/start`,
    title: "Start here",
    description: null,
    plainText: "Start here\n\nInstall the thing & <run> it.",
  },
];

/** The bucket a publish of `slug` at `digest` leaves behind. */
export function publication(
  slug = "demo",
  digest = DIGEST,
): Record<string, string | Uint8Array> {
  const root = `projects/${slug}`;
  return {
    [`${root}/current.json`]: JSON.stringify(pointer(slug, digest)),
    [`${root}/versions/${digest}/content.json`]: JSON.stringify(content(slug)),
    [`${root}/versions/${digest}/search.json`]: JSON.stringify(
      searchEntries(slug),
    ),
    [`${root}/versions/${digest}/assets/pic.svg`]:
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    [`${root}/versions/${digest}/assets/img/shot.png`]: new Uint8Array([
      137, 80, 78, 71,
    ]),
  };
}
