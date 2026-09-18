const UGA_DOMAIN = "@uga.edu";

/** Normalize a UGA MyID or UGA address without accepting another domain. */
export function myIdToEmail(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;

  const local = value.endsWith(UGA_DOMAIN)
    ? value.slice(0, -UGA_DOMAIN.length)
    : value;

  if (!/^[a-z0-9._-]+$/.test(local)) return null;
  return `${local}${UGA_DOMAIN}`;
}

/**
 * Resolve an account for an officer-entered MyID, creating an unconfirmed
 * identity when the member has never signed in. Google sign-in later verifies
 * and claims the same UGA address.
 */
export async function resolveUser(
  email: string,
): Promise<{ userId: string; created: boolean } | null> {
  // Keep the pure MyID normalizer importable by tests and form validation
  // without initializing the database or environment schema.
  const [{ eq }, { db }, { profiles }, { supabaseAdmin }, { usersInAuth }] =
    await Promise.all([
      import("drizzle-orm"),
      import("~/server/db"),
      import("~/server/db/schema"),
      import("~/supabase/admin"),
      import("~/supabase/drizzle/schema"),
    ]);

  const [existing] = await db
    .select({ id: usersInAuth.id })
    .from(usersInAuth)
    .where(eq(usersInAuth.email, email))
    .limit(1);

  if (existing) return { userId: existing.id, created: false };

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: false,
  });

  if (error ?? !data.user) {
    console.error(
      JSON.stringify({
        message: "could not create an account for Airtable correction",
        error: error?.message ?? "missing user",
      }),
    );
    return null;
  }

  await db
    .insert(profiles)
    .values({
      userId: data.user.id,
      preferredName: email.slice(0, -UGA_DOMAIN.length),
    })
    .onConflictDoNothing();

  return { userId: data.user.id, created: true };
}
