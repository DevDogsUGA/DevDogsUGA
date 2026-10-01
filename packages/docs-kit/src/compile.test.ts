/**
 * The compiler's two ordering decisions. A project's position comes from its
 * own index page and nothing else: a nested `index.md` positions its folder in
 * the sidebar, and mistaking one for the other would let a generated reference
 * page reshuffle the docs landing page. The flat page array stays in path
 * order, because consumers index it by path rather than read it in order.
 *
 * These run against a real directory: `compileDocs` reads the filesystem, and
 * a fake of `fs` would be testing the fake.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compileDocs } from "./compile.js";
import { DocsBuildError } from "./errors.js";

let root: string;

function write(rel: string, source: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf-8");
}

/** A fresh content root per test, so one test's fixture can't leak into another. */
function freshRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-order-"));

  write(
    "platform/index.md",
    "---\nname: Platform\norder: 1\n---\n\n# Platform\n",
  );
  write("platform/getting-started.md", "# Getting Started\n");
  write(
    "platform/reference/components/index.md",
    "---\nname: Components\norder: 118\n---\n\n# Components\n",
  );

  // Ordered the same as Platform, so the name tiebreak is what separates them.
  write(
    "study-group-finder/index.md",
    "---\nname: Study Group Finder\norder: 1\n---\n\n# SGF\n",
  );

  // No order at all: it takes the default and sorts by name against the rest.
  write("apis/index.md", "---\nname: APIs\n---\n\n# APIs\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("compileDocs ordering", () => {
  it("sorts projects by order, then by name", () => {
    const { projects } = compileDocs(root);
    expect(projects.map((project) => project.name)).toEqual([
      "Platform",
      "Study Group Finder",
      "APIs",
    ]);
  });

  it("takes a project's order from its own index page only", () => {
    const { projects } = compileDocs(root);
    const platform = projects.find((project) => project.slug === "platform");
    expect(platform?.order).toBe(1);

    // An unordered project stays null rather than being written to the
    // default, so the number lives in exactly one place.
    const apis = projects.find((project) => project.slug === "apis");
    expect(apis?.order).toBeNull();
  });

  it("carries each page's own order through", () => {
    const { pages } = compileDocs(root);
    const byPath = new Map(pages.map((page) => [page.path, page.order]));
    expect(byPath.get("platform/reference/components/index")).toBe(118);
    expect(byPath.get("platform/getting-started")).toBeNull();
  });

  it("leaves the page array in path order, whatever the pages declare", () => {
    const { pages } = compileDocs(root);
    expect(pages.map((page) => page.path)).toEqual([
      "apis/index",
      "platform/getting-started",
      "platform/index",
      "platform/reference/components/index",
      "study-group-finder/index",
    ]);
  });
});

describe("compileDocs section", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("gives a project's own index.md no section", () => {
    root = freshRoot("docs-build-section");
    write("platform/index.md", "---\nname: Platform\n---\n\n# Platform\n");
    const { pages } = compileDocs(root);
    expect(pages.find((p) => p.path === "platform/index")?.section).toBeNull();
  });

  it("refuses a section declared on a project's own index.md", () => {
    root = freshRoot("docs-build-section");
    write(
      "platform/index.md",
      "---\nname: Platform\nsection: guides\n---\n\n# Platform\n",
    );
    expect(() => compileDocs(root)).toThrow(DocsBuildError);
  });

  it("defaults a page under reference/ to the reference section", () => {
    root = freshRoot("docs-build-section");
    write("platform/index.md", "# Platform\n");
    write("platform/reference/db.md", "# DB\n");
    const { pages } = compileDocs(root);
    expect(pages.find((p) => p.path === "platform/reference/db")?.section).toBe(
      "reference",
    );
  });

  it("defaults every other page to guides", () => {
    root = freshRoot("docs-build-section");
    write("platform/index.md", "# Platform\n");
    write("platform/setup.md", "# Setup\n");
    const { pages } = compileDocs(root);
    expect(pages.find((p) => p.path === "platform/setup")?.section).toBe(
      "guides",
    );
  });

  it("takes an explicit section over the default", () => {
    root = freshRoot("docs-build-section");
    write("platform/index.md", "# Platform\n");
    write(
      "platform/deploys.md",
      "---\nsection: infrastructure\n---\n\n# Deploys\n",
    );
    const { pages } = compileDocs(root);
    expect(pages.find((p) => p.path === "platform/deploys")?.section).toBe(
      "infrastructure",
    );
  });

  it("rejects a section that is not one of the four", () => {
    root = freshRoot("docs-build-section");
    write("platform/index.md", "# Platform\n");
    write("platform/setup.md", "---\nsection: onboarding\n---\n\n# Setup\n");
    expect(() => compileDocs(root)).toThrow(DocsBuildError);
  });
});

describe("compileDocs mounting", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("emits a _shared page into every listed project", () => {
    root = freshRoot("docs-build-mount");
    write("platform/index.md", "# Platform\n");
    write("toolkit/index.md", "# Toolkit\n");
    write(
      "_shared/getting-started/troubleshooting.md",
      "---\nmount: [platform, toolkit]\n---\n\n# Troubleshooting\n",
    );

    const { pages, projects } = compileDocs(root);

    // _shared is never a project of its own.
    expect(projects.map((p) => p.slug)).not.toContain("_shared");

    const platformCopy = pages.find(
      (p) => p.path === "platform/getting-started/troubleshooting",
    );
    const toolkitCopy = pages.find(
      (p) => p.path === "toolkit/getting-started/troubleshooting",
    );
    expect(platformCopy?.mountedFrom).toBe("getting-started/troubleshooting");
    expect(toolkitCopy?.mountedFrom).toBe("getting-started/troubleshooting");
    expect(platformCopy?.title).toBe("Troubleshooting");
  });

  it("throws when a mount targets an unknown project", () => {
    root = freshRoot("docs-build-mount");
    write("platform/index.md", "# Platform\n");
    write(
      "_shared/faq.md",
      "---\nmount: [sandbox-that-does-not-exist]\n---\n\n# FAQ\n",
    );
    expect(() => compileDocs(root)).toThrow(DocsBuildError);
  });

  it("throws when a mounted path collides with a real page", () => {
    root = freshRoot("docs-build-mount");
    write("platform/index.md", "# Platform\n");
    write("platform/faq.md", "# Real FAQ\n");
    write("_shared/faq.md", "---\nmount: [platform]\n---\n\n# Shared FAQ\n");
    expect(() => compileDocs(root)).toThrow(DocsBuildError);
  });

  it("throws when mount is missing or not an array", () => {
    root = freshRoot("docs-build-mount");
    write("platform/index.md", "# Platform\n");
    write("_shared/faq.md", "# FAQ with no mount\n");
    expect(() => compileDocs(root)).toThrow(DocsBuildError);
  });
});

describe("compileDocs variants", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const osTabs = [
    "---",
    "mount: [platform, study-group-finder]",
    "---",
    "",
    "# Install",
    "",
    "```bash os=macos",
    "brew install fnm",
    "```",
    '```bash os="linux wsl"',
    "curl -fsSL https://fnm.vercel.app/install | bash",
    "```",
    "",
  ];

  it("reads a project's platforms from its index, in canonical order", () => {
    root = freshRoot("docs-build-variants");
    write("platform/index.md", "# Platform\n");
    write(
      "study-group-finder/index.md",
      "---\nos: [windows, macos, linux, wsl]\n---\n\n# SGF\n",
    );
    const { projects } = compileDocs(root);
    expect(projects.find((p) => p.slug === "platform")?.os).toEqual([
      "macos",
      "linux",
      "wsl",
    ]);
    expect(projects.find((p) => p.slug === "study-group-finder")?.os).toEqual([
      "macos",
      "linux",
      "wsl",
      "windows",
    ]);
  });

  it("holds each mounted copy to its own project's platforms", () => {
    root = freshRoot("docs-build-variants");
    write("platform/index.md", "# Platform\n");
    write(
      "study-group-finder/index.md",
      "---\nos: [macos, linux, wsl, windows]\n---\n\n# SGF\n",
    );
    write("_shared/install.md", osTabs.join("\n"));
    // Covers platform, but not study-group-finder's native Windows.
    expect(() => compileDocs(root)).toThrow(
      /_shared\/install\.md:\d+ \(in study-group-finder\).*Windows \(native\)/,
    );
  });

  it("refuses an os value no project can have", () => {
    root = freshRoot("docs-build-variants");
    write("platform/index.md", "---\nos: [macos, beos]\n---\n\n# Platform\n");
    expect(() => compileDocs(root)).toThrow(DocsBuildError);
  });
});

describe("compileDocs folder settings", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function workshops(): void {
    root = freshRoot("docs-build-folders");
    write("workshops/index.md", "---\nname: Workshops\n---\n\n# Workshops\n");
    write(
      "workshops/supabase/index.md",
      '---\nname: "Workshop: Supabase"\norder: 3\n---\n',
    );
    write(
      "workshops/supabase/nextjs/index.md",
      "---\nname: Integrate with Next.js\nsteps: true\n---\n\n",
    );
    write("workshops/supabase/nextjs/01-read.md", "# Read the Guestbook\n");
    write("workshops/unnamed/index.md", "---\norder: 1\n---\n");
    write("workshops/unnamed/page.md", "# Page\n");
    write("workshops/with-body/index.md", "---\nname: Body\n---\n\n# Hi\n");
  }

  it("reads a body-less nested index.md as folder settings, not a page", () => {
    workshops();
    const { pages, folders } = compileDocs(root);
    expect(pages.map((page) => page.path)).not.toContain(
      "workshops/supabase/index",
    );
    expect(folders).toEqual([
      {
        project: "workshops",
        path: "workshops/supabase",
        name: "Workshop: Supabase",
        description: null,
        order: 3,
        steps: false,
        publishAt: null,
      },
      {
        project: "workshops",
        path: "workshops/supabase/nextjs",
        name: "Integrate with Next.js",
        description: null,
        order: null,
        steps: true,
        publishAt: null,
      },
      {
        project: "workshops",
        path: "workshops/unnamed",
        name: "Unnamed",
        description: null,
        order: 1,
        steps: false,
        publishAt: null,
      },
    ]);
  });

  it("keeps a nested index.md with a body, and a project index, as pages", () => {
    workshops();
    const paths = compileDocs(root).pages.map((page) => page.path);
    expect(paths).toContain("workshops/with-body/index");
    expect(paths).toContain("workshops/index");
  });

  it("refuses steps on a page", () => {
    root = freshRoot("docs-build-steps-page");
    write("p/page.md", "---\nsteps: true\n---\n\n# P\n");
    expect(() => compileDocs(root)).toThrow(/belongs on a folder's settings/);
  });

  it("refuses a steps value that is not a boolean", () => {
    root = freshRoot("docs-build-steps-type");
    write("p/f/index.md", "---\nsteps: yes please\n---\n");
    expect(() => compileDocs(root)).toThrow(/must be true or false/);
  });
});

describe("scheduled pages", () => {
  it("emits publishAt on folders and pages, inheriting the folder's time", () => {
    root = freshRoot("docs-build-scheduled");
    write("w/index.md", "# W\n");
    write("w/a/index.md", "---\nscheduled: 2026-10-05T18:00:00-04:00\n---\n");
    write("w/a/one.md", "# One\n");
    write("w/a/two.md", "---\nscheduled: 2026-10-06T00:00:00Z\n---\n\n# Two\n");
    write("w/a/deep/index.md", "---\nname: Deep\n---\n");
    write("w/a/deep/three.md", "# Three\n");
    write("w/open.md", "# Open\n");
    const { pages, folders } = compileDocs(root);
    const at = (p: string) => pages.find((page) => page.path === p)?.publishAt;
    expect(at("w/a/one")).toBe("2026-10-05T22:00:00.000Z");
    expect(at("w/a/two")).toBe("2026-10-06T00:00:00.000Z");
    expect(at("w/a/deep/three")).toBe("2026-10-05T22:00:00.000Z");
    expect(at("w/open")).toBeNull();
    expect(folders.map((f) => [f.path, f.publishAt])).toEqual([
      ["w/a", "2026-10-05T22:00:00.000Z"],
      ["w/a/deep", "2026-10-05T22:00:00.000Z"],
    ]);
  });

  it("accepts an unquoted YAML timestamp", () => {
    root = freshRoot("docs-build-scheduled-yaml");
    write("w/p.md", "---\nscheduled: 2026-10-05T18:00:00Z\n---\n\n# P\n");
    expect(compileDocs(root).pages[0]!.publishAt).toBe(
      "2026-10-05T18:00:00.000Z",
    );
  });

  it("refuses an invalid time", () => {
    for (const bad of [
      "tomorrow",
      '"2026-10-05T18:00:00"',
      "12",
      "'2026-13-45T00:00:00Z'",
    ]) {
      root = freshRoot("docs-build-scheduled-bad");
      write("w/p.md", `---\nscheduled: ${bad}\n---\n\n# P\n`);
      expect(() => compileDocs(root)).toThrow(/invalid "scheduled/);
    }
  });

  it("refuses a page earlier than its folder", () => {
    root = freshRoot("docs-build-scheduled-early");
    write("w/a/index.md", "---\nscheduled: 2026-10-05T18:00:00Z\n---\n");
    write("w/a/p.md", "---\nscheduled: 2026-10-05T17:59:59Z\n---\n\n# P\n");
    expect(() => compileDocs(root)).toThrow(/earlier than its folder w\/a/);
  });

  it("refuses a folder earlier than its parent folder", () => {
    root = freshRoot("docs-build-scheduled-early-folder");
    write("w/a/index.md", "---\nscheduled: 2026-10-05T18:00:00Z\n---\n");
    write("w/a/b/index.md", "---\nscheduled: 2026-10-01T00:00:00Z\n---\n");
    expect(() => compileDocs(root)).toThrow(/earlier than its folder w\/a/);
  });
});
