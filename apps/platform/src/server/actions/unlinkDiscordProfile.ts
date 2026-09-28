"use server";
import { refresh } from "next/cache";
import { authenticate, expectSession } from "../auth";
import { unlinkProfile } from "../auth/providers/discord";
import { revalidateOfficers } from "~/server/loaders/officers";

export default async function unlinkDiscordProfile() {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/account"),
  );
  await unlinkProfile(userId);
  // Unlinking takes away the Discord-synced roles, leadership ones included.
  revalidateOfficers();
  refresh();
}
