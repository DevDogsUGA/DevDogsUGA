"use server";

import { eq, sql } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "~/server/db";
import { profiles } from '~/server/db/schema';
import { usersInAuth } from "~/supabase/drizzle/schema";
import { expectSession } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";

import { canUserManageVerification } from "~/server/actions/permissions";

interface CsvRow {
  "First Name": string;
  "Last Name": string;
  Email: string;
}

export async function uploadVerificationCSV(
  formData: FormData,
): Promise<{ created: number; updated: number; error?: string }> {
  const callerId = await expectSession();
  if (!(await canUserManageVerification(callerId))) {
    throw new Error("Not authorized to manage verification");
  }

  const file = formData.get("csv");
  if (!(file instanceof File))
    return { created: 0, updated: 0, error: "No file provided" };

  const text = await file.text();
  const { data, errors } = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  if (errors.length > 0) {
    return {
      created: 0,
      updated: 0,
      error: `CSV parse error: ${errors[0]!.message}`,
    };
  }

  const rows = data.filter((r) => r.Email && r["First Name"] && r["Last Name"]);
  if (rows.length === 0) {
    return { created: 0, updated: 0, error: "CSV contains no valid rows" };
  }

  const importedAt = new Date();
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    // Clear all involvement fields — anyone not in this CSV loses involvement status
    await tx.update(profiles).set({
      involvementFirstName: null,
      involvementLastName: null,
      involvementImportedAt: null,
    });

    for (const row of rows) {
      const email = row.Email.toLowerCase();
      const firstName = row["First Name"];
      const lastName = row["Last Name"];

      const [authUser] = await tx
        .select({ id: usersInAuth.id })
        .from(usersInAuth)
        .where(eq(usersInAuth.email, email))
        .limit(1);

      if (!authUser) {
        // Create the user silently (no invite email)
        const { data: newUser, error } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
          });
        if (error || !newUser.user) continue;

        await tx
          .insert(profiles)
          .values({
            userId: newUser.user.id,
            preferredName: `${firstName} ${lastName}`,
            involvementFirstName: firstName,
            involvementLastName: lastName,
            involvementImportedAt: importedAt,
          })
          .onConflictDoNothing();

        created++;
      } else {
        // Update involvement fields, auto-advancing preferredName only when
        // it currently matches the old involvement name (user accepted it)
        await tx
          .update(profiles)
          .set({
            involvementFirstName: firstName,
            involvementLastName: lastName,
            involvementImportedAt: importedAt,
            preferredName: sql`CASE
              WHEN lower(trim(${profiles.preferredName}))
                 = lower(trim(${profiles.involvementFirstName}) || ' ' || trim(${profiles.involvementLastName}))
              THEN ${firstName} || ' ' || ${lastName}
              ELSE ${profiles.preferredName}
            END`,
          })
          .where(eq(profiles.userId, authUser.id));

        updated++;
      }
    }
  });

  return { created, updated };
}
