"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import * as zfd from "zod-form-data";
import { authenticate, expectSession } from "../auth";
import { db } from "../db";
import { profiles } from '../db/schema';

export type AccountVisibilityState = {
  showGithub: boolean;
  showDiscord: boolean;
};

export default async function updateAccountVisibility(
  prevState: AccountVisibilityState,
  formData: FormData,
): Promise<AccountVisibilityState> {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/console/profile"),
  );

  const { provider, show } = await zfd
    .formData({
      provider: zfd.text(z.enum(["github", "discord"])),
      show: zfd.checkbox(),
    })
    .parseAsync(formData);

  await db
    .update(profiles)
    .set(provider === "github" ? { showGithub: show } : { showDiscord: show })
    .where(eq(profiles.userId, userId));

  revalidatePath("/console/profile");

  return provider === "github"
    ? { ...prevState, showGithub: show }
    : { ...prevState, showDiscord: show };
}
