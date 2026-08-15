/**
 * Finding the instance to work against, and signing in to it.
 *
 * Detection is automatic wherever possible. `supabase status -o env` already
 * prints everything needed, and asking a contributor to copy a URL and a key
 * out of one terminal into another is exactly the kind of step that makes a
 * tool feel like homework.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * The repo root, which is where `supabase/config.toml` lives.
 *
 * The Supabase CLI walks up from its working directory looking for that file,
 * and falls back to `basename(cwd)` as the project name when it finds none --
 * so running it from the wrong place fails with "No such container:
 * supabase_db_<whatever directory you were in>", which is a confusing thing to
 * hand someone. Resolved from this file rather than from `cwd` so it does not
 * matter where the contributor invoked the tool.
 */
export const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");

/**
 * Every client here goes through this one factory so they all share a type.
 *
 * supabase-js encodes the default schema in the client's type, so a `schema`
 * parameter of type `string` produces a client that will not unify with a
 * hand-written `SupabaseClient` annotation. Deriving the type from the factory
 * sidesteps that, and cannot go stale when the options below change.
 */
function makeClient(url: string, key: string, schema: string) {
  return createClient(url, key, {
    db: { schema },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type DevtoolsClient = ReturnType<typeof makeClient>;

export interface Instance {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
}

/** The seeded personas, from `supabase/seed/02_moderation.sql`. */
export const PERSONAS = {
  member: "member@devdogs.test",
  author: "author@devdogs.test",
  moderator: "moderator@devdogs.test",
} as const;

/** The built-in Root role, from `supabase/seed/01_roles.sql`. */
export const ROOT_ROLE_ID = "00000000-0000-0000-0000-000000000002";

export const PERSONA_PASSWORD = "password";

/**
 * Reads the local stack's credentials from the Supabase CLI.
 *
 * `-o env` rather than parsing the human-readable table: the table's labels
 * have changed between CLI versions, the env output has not.
 */
export function detectLocalInstance(cwd: string = PROJECT_ROOT): Instance {
  let output: string;
  try {
    // Through `pnpm exec` because the Supabase CLI is a workspace devDependency
    // rather than something a contributor installs globally -- invoking
    // `supabase` directly works only on the machines that happen to have it on
    // PATH, which is not the machine this is written for.
    output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(
      `Could not read the local Supabase stack.\n${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // The CLI prefixes the block with a "Stopped services: [...]" line whenever
  // any optional service is down, which is the normal state here. Lines that do
  // not parse as KEY="value" are skipped rather than treated as an error.
  const values = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(line.trim());
    if (match?.[1]) values.set(match[1], match[2] ?? "");
  }

  const apiUrl = values.get("API_URL");
  // Newer CLI versions print PUBLISHABLE_KEY/SECRET_KEY; older ones print the
  // ANON_KEY/SERVICE_ROLE_KEY names. Both are accepted so the tool does not
  // break on whichever the contributor happens to have installed.
  const publishableKey =
    values.get("PUBLISHABLE_KEY") ?? values.get("ANON_KEY");
  const secretKey = values.get("SECRET_KEY") ?? values.get("SERVICE_ROLE_KEY");

  if (!apiUrl || !publishableKey || !secretKey) {
    throw new Error(
      "`supabase status` did not report an API URL and keys. Is the stack running?",
    );
  }

  return { apiUrl, publishableKey, secretKey };
}

/**
 * Confirms the instance has actually been migrated.
 *
 * This used to be `assertNotProduction()`, which read a tier out of a singleton
 * `platform."instance"` table and refused anything reporting itself as
 * production. That table is gone, and the check it performed was not the one
 * doing the work: `detectLocalInstance()` above reads `supabase status`, which
 * only ever describes the Docker stack on this machine. A remote project cannot
 * reach these commands in the first place, so the tier column was guarding a
 * door that was already walled up — while being one more thing to set correctly
 * on every instance.
 *
 * What was genuinely useful was its error message, because "have you run
 * migrations?" is the failure a contributor actually hits. That is all this
 * does now.
 */
export async function assertMigrated(instance: Instance): Promise<void> {
  const client = makeClient(instance.apiUrl, instance.secretKey, "platform");

  const { error } = await client.from("apps").select("slug").limit(1);

  if (error) {
    throw new Error(
      `Could not read platform."apps": ${error.message}. ` +
        "Have migrations been applied? `pnpm devtools reset` rebuilds from scratch.",
    );
  }
}

/** A service-role client. Bypasses RLS — setup and teardown only. */
export function adminClient(
  instance: Instance,
  schema = "platform",
): DevtoolsClient {
  return makeClient(instance.apiUrl, instance.secretKey, schema);
}

/**
 * A client signed in as a seeded persona, subject to RLS.
 *
 * Signing in for real rather than hand-signing a JWT, so what gets exercised is
 * the same token path production uses — including whatever claims Supabase Auth
 * actually puts in a token, rather than what we assume it does.
 */
export async function personaClient(
  instance: Instance,
  email: string,
  schema = "platform",
): Promise<DevtoolsClient> {
  const client = makeClient(instance.apiUrl, instance.publishableKey, schema);

  const { error } = await client.auth.signInWithPassword({
    email,
    password: PERSONA_PASSWORD,
  });
  if (error) {
    throw new Error(
      `Could not sign in as ${email}: ${error.message}. ` +
        "Seeded personas come from `pnpm devtools` → Reset database.",
    );
  }
  return client;
}
