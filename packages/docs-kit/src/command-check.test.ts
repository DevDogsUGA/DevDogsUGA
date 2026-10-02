import { describe, expect, it } from "vitest";
import { checkCommands } from "./command-check.js";
import type { CommandCheckOptions } from "./command-check.js";
import type { CompiledPage } from "./types.js";
import type { WorkspacePackage } from "./workspace.js";

function page(overrides: Partial<CompiledPage> = {}): CompiledPage {
  return {
    title: "Untitled",
    description: null,
    order: null,
    frontmatter: {},
    headings: [],
    content: "",
    plainText: "",
    project: "schedule-builder",
    path: "schedule-builder/setup",
    section: "getting-started",
    mountedFrom: null,
    publishAt: null,
    variants: {
      project: overrides.project ?? "schedule-builder",
      projects: [],
      os: ["macos", "linux", "wsl"],
      file: "test.md",
    },
    ...overrides,
  };
}

function pkg(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name: "schedule-builder",
    dir: "apps/schedule-builder",
    scripts: new Set(["dev", "build"]),
    ...overrides,
  };
}

function options(
  overrides: Partial<CommandCheckOptions> = {},
): CommandCheckOptions {
  const scheduleBuilder = pkg();
  return {
    devtoolsCommands: new Set(["db", "db migration", "db migration new"]),
    backstageCommands: new Set(["deploy", "deploy smoke", "env", "env audit"]),
    packages: [scheduleBuilder],
    appBySlug: new Map([["schedule-builder", scheduleBuilder]]),
    rootPackage: pkg({
      name: "devdogsuga",
      dir: ".",
      scripts: new Set(["lint"]),
    }),
    ...overrides,
  };
}

function fence(lang: string, body: string, meta = ""): string {
  const info = meta === "" ? lang : `${lang} ${meta}`;
  return `\`\`\`${info}\n${body}\n\`\`\`\n`;
}

describe("checkCommands", () => {
  it("passes a real devtools command", () => {
    const pages = [
      page({ content: fence("sh", "pnpm devtools db migration new") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails a devtools command that does not exist", () => {
    const pages = [
      page({ content: fence("sh", "pnpm devtools db reset --hard") }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("db reset");
  });

  it("passes a real backstage command", () => {
    const pages = [
      page({
        content: fence("sh", "pnpm backstage deploy smoke --tier staging"),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails a backstage command that does not exist, naming backstage", () => {
    const pages = [
      page({ content: fence("sh", "pnpm backstage deploy orphans --prune") }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("pnpm backstage deploy orphans");
    expect(errors[0]?.message).toContain("is not a backstage command");
  });

  it("checks each CLI against its own commands only", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm devtools deploy smoke\npnpm backstage db start",
        ),
      }),
    ];
    expect(checkCommands(pages, options())).toHaveLength(2);
  });

  it("passes a --filter command with a real script", () => {
    const pages = [
      page({ content: fence("bash", "pnpm --filter schedule-builder build") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails --filter naming an unknown package", () => {
    const pages = [
      page({ content: fence("bash", "pnpm --filter nope build") }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("nope");
  });

  it("fails --filter naming a script the package does not have", () => {
    const pages = [
      page({
        content: fence("bash", "pnpm --filter schedule-builder typecheck"),
      }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("typecheck");
  });

  it("accepts the --filter … run <script> spelling", () => {
    const pages = [
      page({
        content: fence("bash", "pnpm --filter schedule-builder run build"),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("resolves a bare `pnpm run` against the app the page is about", () => {
    const pages = [page({ content: fence("sh", "pnpm run build") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails a bare `pnpm run` with a script the app does not have", () => {
    const pages = [page({ content: fence("sh", "pnpm run typecheck") })];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
  });

  it("falls back to the workspace root for a project with no matching app", () => {
    const pages = [
      page({
        project: "toolkit",
        path: "toolkit/ci",
        content: fence("sh", "pnpm run lint"),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a command in a fence marked nocheck", () => {
    const pages = [
      page({
        content: fence("sh", "pnpm devtools db reset --hard", "nocheck"),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a command shown in a non-shell fence", () => {
    const pages = [
      page({ content: fence("ts", "// pnpm devtools db reset --hard") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a line that is not a pnpm invocation", () => {
    const pages = [page({ content: fence("sh", "ls -la") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("strips a leading shell prompt before checking", () => {
    const pages = [
      page({ content: fence("console", "$ pnpm devtools db migration new") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("checks each `&&`-chained segment independently", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm devtools db migration new && pnpm devtools db migration new",
        ),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails the offending half of a `&&`-chained line", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm devtools db migration new && pnpm devtools db reset --hard",
        ),
      }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("db reset");
  });

  it("splits on `;` and `|` as well as `&&`/`||`", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm --filter schedule-builder build ; pnpm --filter schedule-builder dev | cat",
        ),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("accepts any positional args after a leaf devtools command", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm devtools emails TeamInvite\npnpm devtools images 'page/*'",
        ),
        project: "toolkit",
        path: "toolkit/guides/email",
      }),
    ];
    const opts = options({
      devtoolsCommands: new Set(["emails", "images"]),
    });
    expect(checkCommands(pages, opts)).toEqual([]);
  });

  it("fails a devtools group given a child it does not have", () => {
    const pages = [page({ content: fence("sh", "pnpm devtools db bogus") })];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("db bogus");
  });

  it("allows a devtools group invoked with no subcommand", () => {
    const pages = [page({ content: fence("sh", "pnpm devtools db") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("skips flags and their values before matching a devtools command", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm devtools db migration new --tier staging --yes",
        ),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("joins a backslash-continued command before checking it", () => {
    const pages = [
      page({
        content: fence(
          "sh",
          "pnpm devtools db migration new \\\n  --tier staging \\\n  --yes",
        ),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a segment naming a placeholder token", () => {
    const pages = [
      page({ content: fence("sh", "pnpm --filter <app> run cf:build:<tier>") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a --filter path selector it cannot resolve", () => {
    const pages = [
      page({ content: fence("sh", "pnpm --filter ./apps/platform build") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a --filter dependency-graph suffix it cannot resolve", () => {
    const pages = [
      page({
        content: fence("sh", "pnpm --filter 'schedule-builder^...' run build"),
      }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });
});
