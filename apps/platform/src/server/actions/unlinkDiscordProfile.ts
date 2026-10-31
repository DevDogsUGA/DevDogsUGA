"use server";

import { authorizeSession } from "~/server/auth/access";
import { refresh } from "next/cache";
import { authenticate, expectSession } from "../auth";
import { unlinkProfile } from "../auth/providers/discord";
import { revalidateOfficers } from "~/server/loaders/officers";

export default async function unlinkDiscordProfile() {
  const access = await authorizeSession();
  if (!access.ok) {
    await expectSession().catch(() =>
      authenticate("google", "/dashboard/accounts"),
    );
    throw new Error(access.message);
  }

  const userId = await expectSession().catch(() =>
    authenticate("google", "/dashboard/accounts"),
  );
  await unlinkProfile(userId);
  // Unlinking takes away the Discord-synced roles, leadership ones included.
  revalidateOfficers();
  refresh();
}
