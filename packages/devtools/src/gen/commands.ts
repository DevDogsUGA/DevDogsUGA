/**
 * Dispatch for `devtools gen *`.
 *
 * `gen og-assets` and `gen email-templates` delegate to the owning package
 * scripts via pnpm. `gen campus-map` and `gen hypno` are devtools-owned.
 */
import { run } from "../db/run.js";
import { runGenCampusMap } from "./campus-map.js";
import { runGenHypno } from "./hypno.js";

export async function runGen(argv: readonly string[]): Promise<number> {
  const sub = argv[0];

  if (sub === "campus-map") return runGenCampusMap();
  if (sub === "hypno") return runGenHypno();

  if (sub === "og-assets") {
    return run(["--filter", "@devdogsuga/og", "run", "generate"]);
  }

  if (sub === "email-templates") {
    return run(["--filter", "@devdogsuga/email", "run", "compile"]);
  }

  process.stderr.write(
    `devtools gen: unknown subcommand "${sub ?? "(none)"}". ` +
      "Expected: campus-map, hypno, og-assets, email-templates.\n",
  );
  return 1;
}
