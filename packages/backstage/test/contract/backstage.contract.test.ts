/**
 * backstage's contract tests: `pnpm pack` the real package, install the real
 * tarball, and run the real `backstage` bin as a subprocess. They gate
 * publishing (`ci.yaml`, `publish.yaml`), because a bad publish reaches every
 * officer and every CI run through `pnpm dlx` at the latest version, with no
 * review gate in between.
 *
 * Two installs, two questions:
 *
 *   * **dlx**: the tarball alone in a fresh directory outside any repository,
 *     installed with install scripts OFF (`pnpm dlx --config.ignore-scripts=true`
 *     is how a locked-down machine runs it). Does it start without a checkout?
 *     Does the Bitwarden native module load without a postinstall? Both are
 *     things only the packed artifact can show: a workspace run has every
 *     peer and every script.
 *   * **fixture**: the same tarball in a copy of the committed fixture repo
 *     (`packages/cli-core/test-fixtures/fixture-repo/`, a minimal
 *     DevDogsUGA-shaped workspace), for the commands that read a checkout.
 *
 * Slow (a real `pnpm install` each) and network-touching (transitive
 * dependencies resolve normally; only `@devdogsuga/*` is pinned to local
 * tarballs), so it is `pnpm test:contract`, not part of `pnpm test`.
 *
 * PREREQUISITE: `pnpm --filter @devdogsuga/backstage build` (and the same for
 * `@devdogsuga/sdk`, `@devdogsuga/events` and `@devdogsuga/newsletter`, which
 * the bundle inlines). This packs what is on disk, and overrides the
 * `@devdogsuga/sdk` dependency with its local tarball so a published older
 * version cannot stand in for the one under test.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..", "..");
const WORKSPACE_ROOT = join(PACKAGE_ROOT, "..", "..");
const FIXTURE_SRC = join(
  WORKSPACE_ROOT,
  "packages",
  "cli-core",
  "test-fixtures",
  "fixture-repo",
);

const PACK_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const RUN_TIMEOUT_MS = 30_000;

function requireBuilt(pkgDir: string, entry: string): void {
  const path = join(pkgDir, "dist", entry);
  if (!existsSync(path)) {
    throw new Error(
      `${path} does not exist. Run \`pnpm build\` from the Backstage root before \`pnpm test:contract\`.`,
    );
  }
}

/** `pnpm pack`s a workspace package into `destDir`; returns the tarball path. */
function packPackage(pkgDir: string, destDir: string): string {
  const output = execFileSync("pnpm", ["pack", "--pack-destination", destDir], {
    cwd: pkgDir,
    encoding: "utf8",
    timeout: PACK_TIMEOUT_MS,
  });
  const lines = output.trim().split("\n").filter(Boolean);
  return lines[lines.length - 1]!.trim();
}

function install(cwd: string, extraArgs: string[] = []): void {
  const result = spawnSync(
    "pnpm",
    ["install", "--no-frozen-lockfile", ...extraArgs],
    { cwd, encoding: "utf8", timeout: INSTALL_TIMEOUT_MS },
  );
  if (result.status !== 0) {
    throw new Error(
      `pnpm install in ${cwd} failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
}

describe("backstage contract tests", () => {
  let tmpRoot: string;
  let fixtureDir: string;
  let dlxDir: string;
  let emptyDir: string;
  let fixtureBin: string;
  let dlxBin: string;

  beforeAll(
    () => {
      requireBuilt(PACKAGE_ROOT, "launch.js");
      for (const name of ["sdk", "events", "newsletter"]) {
        requireBuilt(join(WORKSPACE_ROOT, "packages", name), "index.js");
      }

      tmpRoot = mkdtempSync(join(tmpdir(), "backstage-contract-"));
      const packDir = join(tmpRoot, "packs");
      mkdirSync(packDir, { recursive: true });

      const backstageTgz = packPackage(PACKAGE_ROOT, packDir);
      const sdkTgz = packPackage(
        join(WORKSPACE_ROOT, "packages", "sdk"),
        packDir,
      );
      // What the officer tools (`graphics`, `qr`, `newsletter`) read: the
      // sdk's brand subpath. `events` and `newsletter` ride inside the bundle.
      const libraryOverrides = `  "@devdogsuga/sdk": "file:${sdkTgz}"\n`;

      // ── dlx: the tarball alone, outside any repo, install scripts off ────
      dlxDir = join(tmpRoot, "dlx");
      mkdirSync(dlxDir);
      writeFileSync(
        join(dlxDir, "package.json"),
        JSON.stringify({
          name: "dlx",
          private: true,
          dependencies: { "@devdogsuga/backstage": `file:${backstageTgz}` },
        }),
      );
      writeFileSync(
        join(dlxDir, "pnpm-workspace.yaml"),
        `overrides:\n` + libraryOverrides,
      );
      install(dlxDir, ["--ignore-scripts"]);
      for (const bundled of ["events", "newsletter", "cli-core"]) {
        if (existsSync(join(dlxDir, "node_modules", "@devdogsuga", bundled))) {
          throw new Error(
            `The dlx directory installed @devdogsuga/${bundled}, which the bundle should have inlined.`,
          );
        }
      }
      dlxBin = join(dlxDir, "node_modules", ".bin", "backstage");
      if (!existsSync(dlxBin)) throw new Error(`${dlxBin} was not created.`);

      // A directory with no repository anywhere above it to run from.
      emptyDir = join(tmpRoot, "empty");
      mkdirSync(emptyDir);

      // ── fixture: the tarball inside a DevDogsUGA-shaped workspace ────────
      fixtureDir = join(tmpRoot, "fixture-repo");
      cpSync(FIXTURE_SRC, fixtureDir, { recursive: true });
      const rootPkgPath = join(fixtureDir, "package.json");
      const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8")) as Record<
        string,
        unknown
      >;
      rootPkg.dependencies = {
        "@devdogsuga/backstage": `file:${backstageTgz}`,
      };
      writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2));
      const workspaceYamlPath = join(fixtureDir, "pnpm-workspace.yaml");
      writeFileSync(
        workspaceYamlPath,
        `${readFileSync(workspaceYamlPath, "utf8")}\noverrides:\n` +
          libraryOverrides +
          `allowBuilds:\n  core-js: false\n  esbuild: true\n`,
      );
      install(fixtureDir);
      fixtureBin = join(fixtureDir, "node_modules", ".bin", "backstage");
      if (!existsSync(fixtureBin)) {
        throw new Error(
          `${fixtureBin} was not created by the fixture install.`,
        );
      }
    },
    2 * INSTALL_TIMEOUT_MS + 3 * PACK_TIMEOUT_MS,
  );

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** Runs an installed `backstage` bin, returning once it exits. */
  function run(
    args: string[],
    options: { bin: string; cwd: string; env?: Record<string, string> },
  ): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(options.bin, args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          // Nothing reaches Sentry or the real home from a test.
          DEVTOOLS_TELEMETRY: "0",
          DEVTOOLS_LOG_DIR: join(tmpRoot, "logs"),
          CI: "true",
          DEPLOY_ENV: "",
          ...options.env,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`backstage timed out: ${args.join(" ")}`));
      }, RUN_TIMEOUT_MS);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });
  }

  const outside = (args: string[], env?: Record<string, string>) =>
    run(args, { bin: dlxBin, cwd: emptyDir, env });
  const inFixture = (args: string[], env?: Record<string, string>) =>
    run(args, { bin: fixtureBin, cwd: fixtureDir, env });

  // ── the package ──────────────────────────────────────────────────────────

  it("ships a bundle with the private core inlined", () => {
    const dist = join(
      dlxDir,
      "node_modules",
      "@devdogsuga",
      "backstage",
      "dist",
    );
    const files = readdirSync(dist).filter((name) => name.endsWith(".js"));
    expect(files).toContain("launch.js");
    const importsCore = /(?:from|import\()\s*["']@devdogsuga\/cli-core/;
    for (const name of files) {
      expect(
        importsCore.test(readFileSync(join(dist, name), "utf8")),
        `${name} imports the private core`,
      ).toBe(false);
    }
  });

  it("does not ship the source entry only devtools' build uses", () => {
    const root = join(dlxDir, "node_modules", "@devdogsuga", "backstage");
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(existsSync(join(root, "env.ts"))).toBe(true);
  });

  it("loads the Bitwarden native module with install scripts off", () => {
    // `pnpm dlx --config.ignore-scripts=true`: the SDK's binary must arrive as
    // a platform package, not from a postinstall.
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const { BitwardenClient } = await import("@bitwarden/sdk-napi"); console.log(typeof BitwardenClient);',
      ],
      {
        // Resolved from where the package really sits, so its own
        // dependencies are visible the way they are to the bin.
        cwd: realpathSync(
          join(dlxDir, "node_modules", "@devdogsuga", "backstage"),
        ),
        encoding: "utf8",
        timeout: RUN_TIMEOUT_MS,
      },
    );
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("function");
    expect(result.status).toBe(0);
  });

  // ── starting without a checkout ──────────────────────────────────────────

  it("--help works from a directory outside any repo", async () => {
    const { status, stdout } = await outside(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("pnpm backstage [command] [options]");
    for (const name of ["deploy", "env", "planner"]) {
      expect(stdout).toContain(name);
    }
  });

  it("version prints the package's own version", async () => {
    const { status, stdout } = await outside(["version"]);
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--help --json lists every command path", async () => {
    const { status, stdout } = await outside(["--help", "--json"]);
    expect(status).toBe(0);
    const paths = (
      JSON.parse(stdout) as { commands: { path: string }[] }
    ).commands.map((command) => command.path);
    for (const path of [
      "deploy platform",
      "deploy write-env",
      "deploy smoke",
      "deploy reconcile",
      "deploy prune-monitors",
      "env pull",
      "env push",
      "env audit",
      "planner status",
      "planner create",
      "import involvement",
      "import attendance",
      "export evidence",
      "export attendance",
      "export reflections",
      "export responses",
      "graphics",
      "qr",
      "github rulesets",
      "github settings",
      "newsletter render",
      "newsletter draft",
      "newsletter send",
      "creds send",
      "creds add",
      "creds renew",
      "creds list",
      "creds report",
    ]) {
      expect(paths).toContain(path);
    }
    for (const gone of ["bw", "deploy require-token", "deploy orphans"]) {
      expect(paths).not.toContain(gone);
    }
  });

  // ── the tools that need nothing ──────────────────────────────────────────

  it("qr writes every format from a directory outside any repo", async () => {
    const out = join(emptyDir, "qr-out");
    const { status, stderr } = await outside([
      "qr",
      "https://devdogsuga.org",
      "--format",
      "svg,png,jpg,webp,avif,tiff",
      "--size",
      "200",
      "--out",
      out,
    ]);
    expect(stderr).not.toContain("Could not");
    expect(status).toBe(0);
    expect(readdirSync(out).sort()).toEqual([
      "qr.avif",
      "qr.jpg",
      "qr.png",
      "qr.svg",
      "qr.tiff",
      "qr.webp",
    ]);
  });

  it("graphics renders brand, app and event images with no checkout", async () => {
    const out = join(emptyDir, "graphics-out");
    const { status, stderr } = await outside([
      "graphics",
      "brand/club",
      "app/dogdays",
      "event/*",
      "--format",
      "og",
      "--out",
      out,
    ]);
    expect(stderr).not.toContain("Could not");
    expect(status).toBe(0);
    const files = readdirSync(out);
    expect(files).toContain("club-og.png");
    expect(files).toContain("dogdays-og.png");
    expect(files.length).toBeGreaterThan(2);
  });

  it("newsletter render writes the files, rasterising through the brand renderer", async () => {
    const out = join(emptyDir, "newsletter-out");
    const { status, stderr } = await outside([
      "newsletter",
      "render",
      "changelog",
      "*",
      "--out",
      out,
    ]);
    expect(stderr).not.toContain("Could not");
    expect(status).toBe(0);
    const files = readdirSync(out);
    expect(files.some((name) => name.endsWith(".eml"))).toBe(true);
    expect(files.some((name) => name.endsWith(".html"))).toBe(true);
  });

  it("newsletter send refuses to go out without --yes and no terminal", async () => {
    const { status, stderr } = await outside([
      "newsletter",
      "send",
      "changelog",
      "*",
      "--to",
      "a@uga.edu",
    ]);
    expect(status).toBe(1);
    expect(stderr).toContain("Pass --yes to send");
    expect(stderr).toContain("a@uga.edu");
  });

  it("creds runs without a checkout and, with no Bitwarden session, says so", async () => {
    const { status, stderr } = await outside(["creds", "list"], {
      BW_SESSION: "",
    });
    expect(status).toBe(1);
    expect(stderr).toContain("Could not use your Bitwarden vault");
    expect(stderr).not.toContain("run this from inside a DevDogsUGA clone");
    expect(stderr).not.toMatch(/\n\s+at /);
  });

  it("completions prints a script without a checkout", async () => {
    const { status, stdout } = await outside([
      "completions",
      "--shell",
      "bash",
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain("complete -F _backstage_complete backstage");
  });

  it("a command that reads a checkout says so instead of throwing", async () => {
    for (const args of [
      ["env", "pull", "--target", "staging"],
      ["planner", "status"],
      ["deploy", "platform", "--tier", "staging"],
    ]) {
      const { status, stderr } = await outside(args);
      expect(status, args.join(" ")).toBe(1);
      expect(stderr, args.join(" ")).toContain(
        "run this from inside a DevDogsUGA clone",
      );
      expect(stderr, args.join(" ")).not.toMatch(/\n\s+at /);
    }
  });

  it("--no-env runs a step with no checkout and no env file", async () => {
    const { status, stderr } = await outside([
      "--no-env",
      "deploy",
      "preflight",
    ]);
    // It got as far as its own check, which wants the caller's PROJECT_REF.
    expect(status).toBe(1);
    expect(stderr).toContain("PROJECT_REF is not set");
    expect(stderr).not.toContain("DevDogsUGA clone");
  });

  it("names the replacement for a retired command", async () => {
    const { status, stderr } = await outside(["bw", "login"]);
    expect(status).toBe(1);
    expect(stderr).toContain("`bw` is gone");
  });

  it("deploy smoke and reconcile refuse without what they need", async () => {
    const smoke = await outside([
      "--no-env",
      "deploy",
      "smoke",
      "--tier",
      "staging",
      "--app",
      "sandbox",
    ]);
    expect(smoke.status).toBe(1);
    expect(smoke.stderr).toContain("sandbox has no smoke test configured");

    const reconcile = await outside(
      ["--no-env", "deploy", "reconcile", "--tier", "staging"],
      { CRON_SECRET: "" },
    );
    expect(reconcile.status).toBe(1);
    expect(reconcile.stderr).toContain("CRON_SECRET is not set");
  });

  // ── inside a checkout ────────────────────────────────────────────────────

  it("a deploy refuses to run without a tier named", async () => {
    const { status, stderr } = await inFixture(["deploy", "demo-app"]);
    expect(status).toBe(1);
    expect(stderr).toContain("no tier named");
  });

  it("deploy <app> --dry-run loads the tier's env, reads workers.json, and needs no token", async () => {
    writeFileSync(join(fixtureDir, ".env.staging"), "DEMO_FLAG=on\n");
    const { status, stdout, stderr } = await inFixture(
      ["deploy", "demo-app", "--tier", "staging", "--dry-run", "--yes"],
      { CLOUDFLARE_API_TOKEN: "" },
    );
    expect(status).toBe(0);
    // stdout belongs to the machine in the deploy group.
    expect(stdout).toBe("");
    expect(stderr).toContain("loaded .env.staging (staging)");
    expect(stderr).toContain("Write demo-app's Worker secrets file");
    expect(stderr).toContain("Deploy demo-app (staging)");
  });

  it("deploy <app> refuses without CLOUDFLARE_API_TOKEN, before writing anything", async () => {
    const { status, stderr } = await inFixture(
      ["deploy", "demo-app", "--tier", "staging", "--yes"],
      { CLOUDFLARE_API_TOKEN: "" },
    );
    expect(status).toBe(1);
    expect(stderr).toContain("CLOUDFLARE_API_TOKEN is not set");
  });

  it("a hosted tier asks first, and with no terminal needs --yes", async () => {
    const { status, stderr } = await inFixture([
      "deploy",
      "demo-app",
      "--tier",
      "staging",
    ]);
    expect(status).toBe(1);
    expect(stderr).toContain("without --yes");
  });

  it("an app with no smoke data in workers.json has no smoke test", async () => {
    const { status, stderr } = await inFixture([
      "--no-env",
      "deploy",
      "smoke",
      "--tier",
      "staging",
      "--app",
      "demo-app",
    ]);
    expect(status).toBe(1);
    expect(stderr).toContain("demo-app has no smoke test configured");
  });

  it("env audit refuses development by name", async () => {
    const { status, stderr } = await inFixture([
      "env",
      "audit",
      "--target",
      "development",
    ]);
    expect(status).toBe(1);
    expect(`${stderr}`).toContain("development");
  });
});
