"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { supabaseAdmin } from "~/supabase/admin";
import { authenticate, expectSession, expectUserWith } from "../auth";
import { db } from "../db";
import { oauthTestAccounts } from '../db/schema';

const MAX_TEST_ACCOUNTS = 5;

function getInitials(displayName: string): string {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((word) => word.match(/[a-z]/i)?.[0]?.toLowerCase() ?? "")
      .join("") || "t"
  );
}

function generateTestEmail(displayName: string, ownerEmail: string): string {
  const initials = getInitials(displayName);
  const digits = (Math.floor(Date.now() / 1000) % 100000)
    .toString()
    .padStart(5, "0");
  const myId = ownerEmail.split("@")[0];
  return `${initials}${digits}@${myId}.devdogsuga.test`;
}

const testAccountSchema = zfd.formData({
  displayName: zfd.text(z.string().min(1).max(255)),
});

const updateSchema = zfd.formData({
  testUserId: zfd.text(z.uuid()),
  displayName: zfd.text(z.string().min(1).max(255)),
});

export type TestAccount = {
  userId: string;
  displayName: string;
  createdAt: string;
};

export async function addTestAccount(formData: FormData) {
  const { displayName } = await testAccountSchema.parseAsync(formData);
  const user = await expectUserWith({
    testAccounts: true,
  }).catch(() => authenticate("google", "/tools/oauth"));

  if (user.testAccounts.length >= MAX_TEST_ACCOUNTS) {
    throw new Error(
      `A maximum of ${MAX_TEST_ACCOUNTS} test accounts are allowed`,
    );
  }

  if (!user.email) {
    throw new Error("Failed to create test account. Please try again.");
  }

  // Synthetic email following the UGA {letters}{numbers}@{domain} convention.
  // The local part uses initials + a seconds-mod-100000 timestamp so no DB
  // check is needed; collisions are practically impossible given the UI
  // enforces at least one second between submissions. The owner's MyID as
  // subdomain scopes uniqueness per user. The .test TLD (IANA-reserved)
  // prevents any risk of impersonation.
  //
  // Display name and email for OAuth clients are stored in user_metadata and
  // surfaced via the custom_access_token hook.
  const testUserId = crypto.randomUUID();
  const { data: createUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      id: testUserId,
      email: generateTestEmail(displayName, user.email),
      email_confirm: true,
      user_metadata: {
        is_test_account: true,
        name: displayName,
        full_name: displayName,
      },
    });

  if (createUserError ?? !createUser.user) {
    console.error({ createUserError });
    throw new Error("Failed to create test account. Please try again.");
  }

  try {
    await db.insert(oauthTestAccounts).values({
      testUserId,
      ownerUserId: user.id,
    });
  } catch (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(createUser.user.id);
    console.error({ insertError });
    throw new Error("Failed to create test account.");
  }

  return { testUserId, displayName };
}

export async function updateTestAccount(
  _prevState: unknown,
  formData: FormData,
) {
  const ownerUserId = await expectSession();
  const { testUserId, displayName } = await updateSchema.parseAsync(formData);

  const account = await db.query.oauthTestAccounts.findFirst({
    where: { ownerUserId, testUserId },
  });

  if (!account) {
    throw new Error("Test account not found");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    testUserId,
    {
      user_metadata: {
        is_test_account: true,
        full_name: displayName,
      },
    },
  );

  if (updateError) {
    console.error({ updateError });
    throw new Error("Failed to update test user.");
  }

  return { testUserId, displayName };
}

export async function deleteTestAccount(testUserId: string): Promise<void> {
  const ownerUserId = await expectSession();

  const account = await db.query.oauthTestAccounts.findFirst({
    where: { ownerUserId, testUserId },
  });

  if (!account) {
    throw new Error("Test account not found");
  }

  await supabaseAdmin.auth.admin.deleteUser(testUserId);

  await db
    .delete(oauthTestAccounts)
    .where(eq(oauthTestAccounts.testUserId, testUserId));
}
