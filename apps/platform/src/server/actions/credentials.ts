"use server";

import { and, eq, inArray } from "drizzle-orm";
import { OTP } from "otplib";
import { db } from "~/server/db";
import {
  credentialRoles,
  credentials,
  roles,
  userRoles,
} from '~/server/db/schema';
import { expectSession } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";

import { canUserCreateCredentials } from "~/server/actions/permissions";

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getUserRoleIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleId);
}

async function userCanViewCredential(
  userId: string,
  credentialId: string,
): Promise<boolean> {
  const roleIds = await getUserRoleIds(userId);
  if (roleIds.length === 0) return false;

  const [match] = await db
    .select({ credentialId: credentialRoles.credentialId })
    .from(credentialRoles)
    .where(
      and(
        eq(credentialRoles.credentialId, credentialId),
        inArray(credentialRoles.roleId, roleIds),
      ),
    )
    .limit(1);

  return match !== undefined;
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

// The vault schema is not in the generated Supabase types, so we cast to any.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

async function storeVaultSecret(secret: string, name: string): Promise<string> {
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .schema("vault")
    .from("secrets")
    .insert({ secret, name })
    .select("id")
    .single();
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  if (error || !data)
    throw new Error(
      `Failed to store secret: ${String((error as { message?: string } | null)?.message)}`,
    );
  return (data as { id: string }).id;
}

async function readVaultSecret(secretId: string): Promise<string | null> {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", secretId)
    .single();
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  if (error || !data) return null;
  return (data as { decrypted_secret: string }).decrypted_secret;
}

async function deleteVaultSecret(secretId: string): Promise<void> {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  const admin = supabaseAdmin as any;
  await admin.schema("vault").from("secrets").delete().eq("id", secretId);
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}

// ── Public actions ────────────────────────────────────────────────────────────

export type CredentialType = "email_password" | "totp" | "email_password_totp";

export interface CreateCredentialInput {
  name: string;
  description?: string;
  type: CredentialType;
  email?: string;
  password?: string;
  totpSecret?: string;
  /** Role UUIDs allowed to view this credential. */
  roleIds: string[];
}

export interface CredentialRow {
  id: string;
  name: string;
  description: string | null;
  type: CredentialType;
  email: string | null;
  hasPassword: boolean;
  hasTotp: boolean;
  roles: Array<{ id: string; title: string }>;
}

/**
 * Creates a new credential set. Caller must have `canCreateCredentials`.
 * Secrets are stored encrypted in Supabase Vault.
 */
export async function createCredential(
  input: CreateCredentialInput,
): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserCreateCredentials(userId))) {
    throw new Error("Not authorized to create credentials");
  }

  const { name, description, type, email, password, totpSecret, roleIds } =
    input;

  if (!name.trim()) throw new Error("Name is required");
  if (roleIds.length === 0) throw new Error("At least one role is required");
  if (type !== "totp" && !password) throw new Error("Password is required");
  if (type !== "email_password" && !totpSecret)
    throw new Error("TOTP secret is required");

  const tempId = crypto.randomUUID();

  let passwordSecretId: string | null = null;
  let totpSecretId: string | null = null;

  if (password) {
    passwordSecretId = await storeVaultSecret(
      password,
      `credential_password_${tempId}`,
    );
  }
  if (totpSecret) {
    totpSecretId = await storeVaultSecret(
      totpSecret,
      `credential_totp_${tempId}`,
    );
  }

  const [row] = await db
    .insert(credentials)
    .values({
      name: name.trim(),
      description: description?.trim() || null,
      type,
      email: email?.trim() || null,
      passwordSecretId,
      totpSecretId,
      createdBy: userId,
    })
    .returning({ id: credentials.id });

  const credentialId = row!.id;

  await db
    .insert(credentialRoles)
    .values(roleIds.map((roleId) => ({ credentialId, roleId })));
}

/**
 * Deletes a credential set and its vault secrets. Caller must have
 * `canCreateCredentials`.
 */
export async function deleteCredential(credentialId: string): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserCreateCredentials(userId))) {
    throw new Error("Not authorized to delete credentials");
  }

  const [credential] = await db
    .select({
      passwordSecretId: credentials.passwordSecretId,
      totpSecretId: credentials.totpSecretId,
    })
    .from(credentials)
    .where(eq(credentials.id, credentialId))
    .limit(1);

  if (!credential) throw new Error("Credential not found");

  await db.delete(credentials).where(eq(credentials.id, credentialId));

  if (credential.passwordSecretId) {
    await deleteVaultSecret(credential.passwordSecretId);
  }
  if (credential.totpSecretId) {
    await deleteVaultSecret(credential.totpSecretId);
  }
}

/**
 * Returns the plaintext password for a credential the caller can access.
 * Never returns the vault secret ID.
 */
export async function revealPassword(credentialId: string): Promise<string> {
  const userId = await expectSession();
  if (!(await userCanViewCredential(userId, credentialId))) {
    throw new Error("Not authorized");
  }

  const [credential] = await db
    .select({ passwordSecretId: credentials.passwordSecretId })
    .from(credentials)
    .where(eq(credentials.id, credentialId))
    .limit(1);

  if (!credential?.passwordSecretId) throw new Error("No password stored");

  const secret = await readVaultSecret(credential.passwordSecretId);
  if (!secret) throw new Error("Failed to retrieve password");
  return secret;
}

/**
 * Returns the current 6-digit TOTP code and the epoch ms when it expires.
 * The raw TOTP seed is never returned.
 */
export async function getCurrentOTP(
  credentialId: string,
): Promise<{ otp: string; validUntil: number }> {
  const userId = await expectSession();
  if (!(await userCanViewCredential(userId, credentialId))) {
    throw new Error("Not authorized");
  }

  const [credential] = await db
    .select({ totpSecretId: credentials.totpSecretId })
    .from(credentials)
    .where(eq(credentials.id, credentialId))
    .limit(1);

  if (!credential?.totpSecretId) throw new Error("No TOTP secret stored");

  const secret = await readVaultSecret(credential.totpSecretId);
  if (!secret) throw new Error("Failed to retrieve TOTP secret");

  const otpInstance = new OTP();
  const otp = await otpInstance.generate({ secret });
  const step = 30; // TOTP default period (seconds)
  const epoch = Math.floor(Date.now() / 1000);
  const validUntil = (Math.floor(epoch / step) + 1) * step * 1000;

  return { otp, validUntil };
}

/**
 * Returns true if the user should see the Credentials nav item: either they
 * can create credentials, or at least one credential is assigned to one of their roles.
 */
export async function canSeeCredentialsPage(userId: string): Promise<boolean> {
  const [canCreate, roleIds] = await Promise.all([
    canUserCreateCredentials(userId),
    getUserRoleIds(userId),
  ]);
  if (canCreate) return true;
  if (roleIds.length === 0) return false;

  const [match] = await db
    .select({ credentialId: credentialRoles.credentialId })
    .from(credentialRoles)
    .where(inArray(credentialRoles.roleId, roleIds))
    .limit(1);

  return match !== undefined;
}

/**
 * Returns credentials visible to the calling user based on their roles.
 */
export async function getAccessibleCredentials(
  userId: string,
): Promise<CredentialRow[]> {
  const roleIds = await getUserRoleIds(userId);
  if (roleIds.length === 0) return [];

  const visibleRoles = await db
    .select({
      credentialId: credentialRoles.credentialId,
      roleId: credentialRoles.roleId,
    })
    .from(credentialRoles)
    .where(inArray(credentialRoles.roleId, roleIds));

  if (visibleRoles.length === 0) return [];

  const uniqueIds = [...new Set(visibleRoles.map((r) => r.credentialId))];

  const [rows, allRoleRows] = await Promise.all([
    db
      .select({
        id: credentials.id,
        name: credentials.name,
        description: credentials.description,
        type: credentials.type,
        email: credentials.email,
        passwordSecretId: credentials.passwordSecretId,
        totpSecretId: credentials.totpSecretId,
      })
      .from(credentials)
      .where(inArray(credentials.id, uniqueIds)),
    db
      .select({
        credentialId: credentialRoles.credentialId,
        roleId: roles.id,
        roleTitle: roles.title,
      })
      .from(credentialRoles)
      .innerJoin(roles, eq(roles.id, credentialRoles.roleId))
      .where(inArray(credentialRoles.credentialId, uniqueIds)),
  ]);

  const allRolesByCredential = new Map<
    string,
    Array<{ id: string; title: string }>
  >();
  for (const r of allRoleRows) {
    const existing = allRolesByCredential.get(r.credentialId) ?? [];
    existing.push({ id: r.roleId, title: r.roleTitle });
    allRolesByCredential.set(r.credentialId, existing);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as CredentialType,
    email: row.email,
    hasPassword: row.passwordSecretId !== null,
    hasTotp: row.totpSecretId !== null,
    roles: allRolesByCredential.get(row.id) ?? [],
  }));
}
