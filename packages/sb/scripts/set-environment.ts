/**
 * Set `platform."instance"."environment"` on the linked project.
 *
 * `platform."instance"` defaults to 'production' so a fresh database fails
 * closed. Local stacks are demoted by `supabase/seed/00_instance.sql`, but
 * seeds only run on `supabase db reset` -- never on `db push` -- so a
 * contributor who pushes migrations to their own hosted project would land on
 * the default and find every development-only capability denied. This is the
 * one-off that opens it.
 *
 *   pnpm --filter @devdogsuga/sb set-environment test
 *
 * Requires API_URL and SECRET_KEY in the root .env: the row is deliberately
 * unwritable by anon/authenticated, so only the service role can change it.
 */
import { createAdminClient } from "../src/index";

const ENVIRONMENTS = ["local", "test", "production"] as const;
type Environment = (typeof ENVIRONMENTS)[number];

function isEnvironment(value: string): value is Environment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

async function main() {
  const target = process.argv[2];

  if (!target || !isEnvironment(target)) {
    console.error(
      `Usage: pnpm --filter @devdogsuga/sb set-environment <${ENVIRONMENTS.join("|")}>\n` +
        (target ? `\nUnknown environment: ${target}` : ""),
    );
    process.exit(1);
  }

  const url = process.env.API_URL;
  const key = process.env.SECRET_KEY;

  if (!url || !key) {
    console.error(
      "API_URL and SECRET_KEY must be set in the root .env " +
        "(run through `with-env`, which every `pnpm sb` script does).",
    );
    process.exit(1);
  }

  const admin = createAdminClient({ url, key, schema: "platform" });

  const { error } = await admin
    .from("instance")
    .update({ environment: target })
    .eq("id", true);

  if (error) {
    console.error(`Failed to set environment: ${error.message}`);
    process.exit(1);
  }

  console.log(`${url} → environment = ${target}`);

  if (target === "production") {
    console.log(
      "Development-only capabilities are now denied on this instance, and " +
        "the contributor tooling will refuse to target it.",
    );
  }
}

await main();
