/**
 * Harness for RLS persona tests.
 *
 * RLS is now the whole security boundary. Previously an API route was where a
 * check lived and where a reviewer would look for it; with apps writing
 * straight to Postgres, a missing predicate in a policy *is* the vulnerability,
 * and one publishable key reaches every schema. These tests are what stands
 * where route review used to.
 *
 * Personas sign in for real (`signInWithPassword`) rather than using
 * hand-signed JWTs, so what is exercised is the same token path production
 * uses -- including whatever claims Supabase Auth actually puts in a token,
 * rather than what we assume it does.
 *
 * Requires the local stack: `pnpm sb link`.
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

export const LOCAL_API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";

const SECRET_KEY = process.env.SECRET_KEY;
const PUBLISHABLE_KEY = process.env.PUBLISHABLE_KEY;

export const ROOT_ROLE_ID = "00000000-0000-0000-0000-000000000002";

/**
 * Clients default to the `platform` schema, which is where everything under
 * test lives. A case needing another schema calls `.schema(name)` on the
 * client rather than parameterising this, which keeps one concrete client type
 * instead of a generic that varies per call site.
 */
const SCHEMA = "platform";

/** Service-role client: bypasses RLS. Fixture setup only, never an assertion. */
export function admin() {
  if (!SECRET_KEY) {
    throw new Error("SECRET_KEY is required (run via `with-env --local`)");
  }
  return createClient(LOCAL_API_URL, SECRET_KEY, {
    db: { schema: SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anonymous client: the publishable key with no session. */
export function anon() {
  if (!PUBLISHABLE_KEY) {
    throw new Error("PUBLISHABLE_KEY is required (run via `with-env --local`)");
  }
  return createClient(LOCAL_API_URL, PUBLISHABLE_KEY, {
    db: { schema: SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type PersonaClient = ReturnType<typeof anon>;

export interface Persona {
  userId: string;
  email: string;
  /** Client carrying this persona's session. Subject to RLS. */
  client: PersonaClient;
}

const PASSWORD = "persona-password-1234";

/**
 * Creates an auth user and returns a client signed in as them.
 *
 * Emails use the IANA-reserved `.test` TLD, matching the convention in
 * `actions/testAccounts.ts`, so a fixture can never collide with a real
 * address.
 */
export async function createPersona(name: string): Promise<Persona> {
  const email = `${name}-${crypto.randomUUID().slice(0, 8)}@persona.test`;

  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error ?? !data.user) {
    throw new Error(`createPersona(${name}) failed: ${error?.message}`);
  }

  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) {
    throw new Error(
      `createPersona(${name}) sign-in failed: ${signInError.message}`,
    );
  }

  return { userId: data.user.id, email, client };
}

/** Deletes personas and anything cascading from them. */
export async function destroyPersonas(...personas: Persona[]): Promise<void> {
  const a = admin();
  for (const p of personas) {
    await p.client.auth.signOut();
    await a.auth.admin.deleteUser(p.userId);
  }
}

/** Grants a custom role carrying `permissions` to a persona. */
export async function grantRole(
  persona: Persona,
  title: string,
  permissions: Record<string, boolean>,
): Promise<string> {
  const a = admin();
  const roleId = crypto.randomUUID();

  const { error: roleError } = await a.from("roles").insert({
    id: roleId,
    title: `${title}-${roleId.slice(0, 8)}`,
    description: "",
    roleType: "custom",
    // Randomised so concurrent fixtures don't collide on the unique rank index.
    rank: Math.random() * 1_000_000,
    ...permissions,
  });
  if (roleError) throw new Error(`grantRole failed: ${roleError.message}`);

  const { error: linkError } = await a
    .from("userRoles")
    .insert({ userId: persona.userId, roleId });
  if (linkError) throw new Error(`grantRole link failed: ${linkError.message}`);

  return roleId;
}

export async function deleteRole(roleId: string): Promise<void> {
  await admin().from("roles").delete().eq("id", roleId);
}

/** Marks a persona as an OAuth test account owned by `owner`. */
export async function makeTestAccount(
  persona: Persona,
  owner: Persona,
): Promise<void> {
  const { error } = await admin()
    .from("oauthTestAccounts")
    .insert({ testUserId: persona.userId, ownerUserId: owner.userId });
  if (error) throw new Error(`makeTestAccount failed: ${error.message}`);
}

/** Suspends a persona org-wide. */
export async function suspend(persona: Persona): Promise<void> {
  const { error } = await admin()
    .from("userSuspensions")
    .insert({ userId: persona.userId, service: "global" });
  if (error) throw new Error(`suspend failed: ${error.message}`);
}

/**
 * Direct SQL, for the handful of claims PostgREST cannot express.
 *
 * Two of them are central to this design and would otherwise go untested:
 * that a table becomes a content type by acquiring a foreign key (DDL), and
 * that a resolution whose content action cannot be applied rolls back as a unit
 * (an explicit transaction). Everything else in these suites goes through
 * supabase-js on purpose, because that is the path an app actually takes.
 */
let sqlClient: postgres.Sql | undefined;

export function sql(): postgres.Sql {
  sqlClient ??= postgres(
    process.env.DB_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    { max: 2, onnotice: () => {} },
  );
  return sqlClient;
}

export async function closeSql(): Promise<void> {
  await sqlClient?.end();
  sqlClient = undefined;
}

/** The registry id of an app, by slug. */
export async function appId(slug: string): Promise<string> {
  const { data, error } = await admin()
    .from("apps")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`appId(${slug}) failed: ${error.message}`);
  return data.id as string;
}

/** A report reason's id, by app slug and title. Seeded by `02_moderation.sql`. */
export async function reasonId(slug: string, title: string): Promise<string> {
  const { data, error } = await admin()
    .from("reportReasons")
    .select("id")
    .eq("appId", await appId(slug))
    .eq("title", title)
    .single();
  if (error)
    throw new Error(`reasonId(${slug}, ${title}) failed: ${error.message}`);
  return data.id as string;
}

/** Creates a sandbox post authored by `persona`, returning its id. */
export async function createPost(
  persona: Persona,
  title: string,
  body: string,
): Promise<string> {
  const { data, error } = await admin()
    .schema("sandbox")
    .from("posts")
    .insert({ authorUserId: persona.userId, title, body })
    .select("id")
    .single();
  if (error) throw new Error(`createPost failed: ${error.message}`);
  return data.id as string;
}

/** Deletes sandbox posts by id, ignoring ones already gone. */
export async function deletePosts(...ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await admin().schema("sandbox").from("posts").delete().in("id", ids);
}

/** Deletes reports (and their cascading corroborations/resolutions) by id. */
export async function deleteReports(...ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await admin().from("reports").delete().in("id", ids);
}

/** Temporarily flips the instance environment, restoring it afterwards. */
export async function withEnvironment<T>(
  environment: "local" | "test" | "production",
  fn: () => Promise<T>,
): Promise<T> {
  const a = admin();
  const { data: before } = await a
    .from("instance")
    .select("environment")
    .eq("id", true)
    .single();

  await a.from("instance").update({ environment }).eq("id", true);
  try {
    return await fn();
  } finally {
    await a
      .from("instance")
      .update({ environment: before?.environment ?? "local" })
      .eq("id", true);
  }
}
