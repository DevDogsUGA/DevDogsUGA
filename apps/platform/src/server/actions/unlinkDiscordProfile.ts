"use server";
import { refresh } from "next/cache";
import { authenticate, expectSession } from "../auth";
import { unlinkProfile } from "../auth/providers/discord";

export default async function unlinkDiscordProfile() {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/console/profile"),
  );
  await unlinkProfile(userId);
  refresh();
}
