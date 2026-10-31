import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Layout {
  kind: string;
  root: string;
  devdogsugaRoot: string;
}
const layout = vi.hoisted((): { value: Layout } => ({
  value: { kind: "backstage", root: "", devdogsugaRoot: "" },
}));
vi.mock("@devdogsuga/cli-core/repo/layout", () => ({
  resolveLayout: () => layout.value,
}));

import { catalog } from "../catalog.js";
import { createDocsHandler, handleDocs, type DocsDeps } from "./commands.js";
import { DOCS_KIT_BIN } from "./check.js";

const dirs: string[] = [];
let out = "";
let err = "";

beforeEach(() => {
  out = "";
  err = "";
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function checkout(withDocsKit = true) {
  const root = mkdtempSync(join(tmpdir(), "devtools-docs-cmd-"));
  dirs.push(root);
  if (withDocsKit) {
    mkdirSync(join(root, "packages", "docs-kit", "bin"), { recursive: true });
    writeFileSync(join(root, DOCS_KIT_BIN), "");
  }
  layout.value = { kind: "backstage", root, devdogsugaRoot: root };
  return root;
}

const answering = (stdout: string, stderr = ""): DocsDeps => ({
  run: vi.fn(async () => ({ code: 0, stdout, stderr })),
  cwd: () => "/work",
});

const READY = JSON.stringify({
  ready: true,
  problems: [],
  pages: 2,
  assets: 0,
});
const NOT_READY = JSON.stringify({
  ready: false,
  pages: 1,
  assets: 0,
  problems: [{ kind: "link", file: "index.md:3", message: "broken" }],
});

describe("devtools docs check", () => {
  it("is in the catalog, as a cli-only command with no env", () => {
    expect(catalog.subcommandList(["docs"])).toContain("check");
    const node = catalog.findCommand(["docs", "check"]);
    expect(node).toMatchObject({
      surface: "cli-only",
      envFree: true,
      noEnv: true,
    });
  });

  it("runs docs-kit on docs/ at the repository's root, and exits 0 when it is ready", async () => {
    const root = checkout();
    const deps = answering(READY);
    const handler = createDocsHandler(deps);
    expect(await handler(["check"])).not.toBeNull();
    expect(deps.run).toHaveBeenCalledWith(
      join(root, DOCS_KIT_BIN),
      join(root, "docs"),
    );
    expect(out).toBe("docs check: ready (2 pages, 0 images).\n");
    expect(process.exitCode).toBe(0);
  });

  it("exits non-zero and lists the problems when it is not", async () => {
    checkout();
    const handler = createDocsHandler(answering(NOT_READY));
    expect(await handler(["check"])).toBeNull();
    expect(err).toBe("docs check: 1 problem\n  index.md:3: broken\n");
    expect(process.exitCode).toBe(1);
  });

  it("checks the folder it is named, from where it is run", async () => {
    const root = checkout();
    const deps = answering(READY);
    await createDocsHandler(deps)(["check", "../mine/docs"]);
    expect(deps.run).toHaveBeenCalledWith(
      join(root, DOCS_KIT_BIN),
      resolve("/work", "../mine/docs"),
    );
  });

  it("refuses DevDogsUGA's own docs/ unless named", async () => {
    const root = checkout();
    layout.value = { kind: "devdogsuga", root, devdogsugaRoot: root };
    const deps = answering(READY);
    expect(await createDocsHandler(deps)(["check"])).toBeNull();
    expect(err).toContain("DevDogsUGA repository");
    expect(deps.run).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("says where docs-kit should be when the DevDogsUGA checkout has none", async () => {
    checkout(false);
    const deps = answering(READY);
    expect(await createDocsHandler(deps)(["check"])).toBeNull();
    expect(err).toContain("docs-kit isn't in the DevDogsUGA checkout");
    expect(err).toContain("pnpm install");
    expect(deps.run).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("fails, with what docs-kit said, when it did not answer with a verdict", async () => {
    checkout();
    const handler = createDocsHandler(
      answering("nonsense", "boom: tsx missing"),
    );
    expect(await handler(["check"])).toBeNull();
    expect(err).toContain("docs-kit didn't answer");
    expect(err).toContain("boom: tsx missing");
    expect(process.exitCode).toBe(1);
  });

  it("fails, rather than crashing, when the checkout can't be found", async () => {
    layout.value = {
      kind: "backstage",
      root: "/nowhere",
      get devdogsugaRoot(): string {
        throw new Error(
          "The DevDogsUGA checkout is missing at /nowhere/devdogsuga.",
        );
      },
    };
    expect(await createDocsHandler(answering(READY))(["check"])).toBeNull();
    expect(err).toContain("docs check: The DevDogsUGA checkout is missing");
    expect(process.exitCode).toBe(1);
  });

  it("names the subcommands when there is none, or a wrong one", async () => {
    expect(await createDocsHandler(answering(READY))([])).toBeNull();
    expect(err).toContain("devtools docs: which of");
    err = "";
    expect(await createDocsHandler(answering(READY))(["lint"])).toBeNull();
    expect(err).toContain('unknown command "lint"');
    expect(process.exitCode).toBe(1);
  });
});

describe("devtools docs check, against the real docs-kit", () => {
  it("judges a ready folder ready and a broken one not", async () => {
    // The checkout this test runs in has docs-kit; the layout is this repo's.
    const repo = resolve(__dirname, "..", "..", "..", "..");
    layout.value = { kind: "devdogsuga", root: repo, devdogsugaRoot: repo };
    const docs = mkdtempSync(join(tmpdir(), "devtools-docs-real-"));
    dirs.push(docs);
    writeFileSync(join(docs, "index.md"), "# Demo\n\nSee [g](./g.md).\n");
    writeFileSync(join(docs, "g.md"), "# G\n\ntext\n");

    expect(await handleDocs(["check", docs])).not.toBeNull();
    expect(err).toBe("");
    expect(out).toBe("docs check: ready (2 pages, 0 images).\n");

    out = "";
    writeFileSync(join(docs, "bad.md"), "# Bad\n\n[x](./none.md)\n");
    expect(await handleDocs(["check", docs])).toBeNull();
    expect(err).toContain("docs check: 1 problem");
    expect(err).toContain("bad.md:3: links to");
    expect(process.exitCode).toBe(1);
  }, 90_000);
});
