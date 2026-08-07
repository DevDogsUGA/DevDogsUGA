import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
import { PROVIDER_SCOPES } from "./config.js";

export type LocalSupabaseConfig = {
  apiUrl: string;
  serviceRoleKey: string;
};

function runStatus(argv: string[], cwd: string): string {
  return execFileSync(argv[0]!, argv.slice(1), {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Runs `supabase status -o env` in `cwd` and extracts the local API URL and
 * service role key. Throws a descriptive error if Supabase isn't running or
 * the CLI isn't installed.
 *
 * Two invocations are tried, because this wizard runs in two different worlds:
 * a sibling project, where the Supabase CLI is normally installed globally, and
 * this monorepo, where it is a workspace devDependency and not on PATH at all.
 * A global install wins, since `pnpm exec` in a non-pnpm project would fail for
 * reasons that have nothing to do with Supabase.
 */
export function detectLocalSupabase(cwd: string): LocalSupabaseConfig {
  let output: string;
  try {
    output = runStatus(["supabase", "status", "-o", "env"], cwd);
  } catch (first) {
    try {
      output = runStatus(
        ["pnpm", "exec", "supabase", "status", "-o", "env"],
        cwd,
      );
    } catch {
      // The first failure is the one worth reporting: it is the one that says
      // "not installed" rather than "pnpm could not find a workspace".
      if ((first as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "supabase CLI not found — install it from https://supabase.com/docs/guides/cli",
        );
      }
      const stderr = (first as { stderr?: string }).stderr?.trim();
      throw new Error(
        stderr || (first instanceof Error ? first.message : String(first)),
      );
    }
  }

  const env = parse(output);
  const apiUrl = env["API_URL"];
  const serviceRoleKey = env["SERVICE_ROLE_KEY"];

  if (!apiUrl || !serviceRoleKey) {
    throw new Error(
      "Could not find API_URL or SERVICE_ROLE_KEY in `supabase status` output",
    );
  }

  return { apiUrl, serviceRoleKey };
}

/**
 * Creates or updates the `custom:devdogs` provider on a local Supabase
 * instance using the Admin SDK. Returns the resulting identifier and issuer.
 */
export async function checkProvider(
  { apiUrl, serviceRoleKey }: LocalSupabaseConfig,
  identifier: string,
): Promise<{ exists: boolean; name?: string; issuer?: string }> {
  const supabase = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } =
    await supabase.auth.admin.customProviders.getProvider(identifier);
  if (error && (error as { status?: number }).status !== 404) throw error;
  return {
    exists: !!data,
    name: data?.name ?? undefined,
    issuer: data?.issuer ?? undefined,
  };
}

export async function upsertDevDogsProvider(
  { apiUrl, serviceRoleKey }: LocalSupabaseConfig,
  {
    identifier,
    name,
    clientId,
    clientSecret,
    issuer,
  }: {
    identifier: string;
    name: string;
    clientId: string;
    clientSecret: string;
    issuer: string;
  },
): Promise<{ identifier: string; issuer: string }> {
  const supabase = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: getError } =
    await supabase.auth.admin.customProviders.getProvider(identifier);

  // 404 just means the provider doesn't exist yet — any other error is real.
  if (getError && (getError as { status?: number }).status !== 404) {
    throw getError;
  }

  if (existing) {
    const { data, error } =
      await supabase.auth.admin.customProviders.updateProvider(identifier, {
        name,
        client_id: clientId,
        client_secret: clientSecret,
        issuer,
        scopes: PROVIDER_SCOPES,
        enabled: true,
      });
    if (error) throw error;
    if (!data) throw new Error("updateProvider returned no data");
    return { identifier: data.identifier, issuer: data.issuer ?? issuer };
  }

  const { data, error } =
    await supabase.auth.admin.customProviders.createProvider({
      provider_type: "oidc",
      identifier,
      name,
      client_id: clientId,
      client_secret: clientSecret,
      issuer,
      scopes: PROVIDER_SCOPES,
      enabled: true,
    });
  if (error) throw error;
  if (!data) throw new Error("createProvider returned no data");
  return { identifier: data.identifier, issuer: data.issuer ?? issuer };
}
