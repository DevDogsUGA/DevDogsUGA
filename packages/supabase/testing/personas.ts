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
    throw new Error(
      "SECRET_KEY is required (run via `with-env`, with the local stack up)",
    );
  }
  return createClient(LOCAL_API_URL, SECRET_KEY, {
    db: { schema: SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anonymous client: the publishable key with no session. */
export function anon() {
  if (!PUBLISHABLE_KEY) {
    throw new Error(
      "PUBLISHABLE_KEY is required (run via `with-env`, with the local stack up)",
    );
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

/**
 * An account with a profile: the reportable content on this instance.
 *
 * Cheaper than `createPersona` on purpose — no sign-in round trip — because
 * most of these exist only to BE reported, never to act. A test that needs the
 * subject to do something (edit its own profile, say) wants a persona instead.
 *
 * The returned id is both the account and the content reference. That is not a
 * shortcut to be tidied away later: `platform.profile` is one row per user
 * keyed on "userId", so addressing the content and addressing its author are
 * the same question, and `content_types()` derives both columns as "userId".
 */
export interface Subject {
  userId: string;
  email: string;
}

export async function createSubject(
  name: string,
  fields: {
    preferredName?: string;
    bio?: string;
    legalFirstName?: string;
    legalLastName?: string;
  } = {},
): Promise<Subject> {
  const email = `${name}-${crypto.randomUUID().slice(0, 8)}@persona.test`;
  const a = admin();

  const { data, error } = await a.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error ?? !data.user) {
    throw new Error(`createSubject(${name}) failed: ${error?.message}`);
  }

  const { error: profileError } = await a.from("profile").insert({
    userId: data.user.id,
    preferredName: fields.preferredName ?? name,
    bio: fields.bio ?? null,
    legalFirstName: fields.legalFirstName ?? null,
    legalLastName: fields.legalLastName ?? null,
  });
  if (profileError) {
    throw new Error(
      `createSubject(${name}) profile failed: ${profileError.message}`,
    );
  }

  return { userId: data.user.id, email };
}

/** Gives an existing persona a profile, so it can be reported as well as act. */
export async function giveProfile(
  persona: Persona,
  fields: {
    preferredName?: string;
    bio?: string;
    legalFirstName?: string;
    legalLastName?: string;
  } = {},
): Promise<string> {
  const { error } = await admin()
    .from("profile")
    .upsert(
      {
        userId: persona.userId,
        preferredName: fields.preferredName ?? "Persona",
        bio: fields.bio ?? null,
        legalFirstName: fields.legalFirstName ?? null,
        legalLastName: fields.legalLastName ?? null,
      },
      { onConflict: "userId" },
    );
  if (error) throw new Error(`giveProfile failed: ${error.message}`);
  return persona.userId;
}

/**
 * Deletes subjects, and the profiles that cascade from them.
 *
 * Deleting the auth user is what does the work: profile carries
 * `on delete cascade` to auth.users, so removing the row directly would leave
 * the account behind and slowly fill the local instance with them.
 */
export async function destroySubjects(...subjects: Subject[]): Promise<void> {
  const a = admin();
  for (const s of subjects) {
    await a.auth.admin.deleteUser(s.userId);
  }
}

/** Deletes reports (and their cascading corroborations/resolutions) by id. */
export async function deleteReports(...ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await admin().from("reports").delete().in("id", ids);
}

/**
 * The single row a set-returning RPC came back with.
 *
 * The client-facing RPCs return `setof` rather than `jsonb`, so PostgREST
 * serialises even a one-object result as a one-element array. Throwing on an
 * empty result rather than returning undefined keeps the failure at the call
 * that produced it, instead of as a `cannot read property of undefined` three
 * assertions later.
 */
export function one<T>(data: unknown): T {
  const rows = data as T[] | null;
  if (!rows || rows.length === 0) {
    throw new Error("RPC returned no rows");
  }
  return rows[0]!;
}
