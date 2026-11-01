import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccountDeletionPending from "~/components/AccountDeletion";
import { getPendingDeletion } from "~/server/accountDeletion/schedule";
import { requireDashboard } from "~/server/auth/access";
import { getVerificationStatus } from "~/server/loaders/verification";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "Account scheduled for deletion | DevDogs",
  robots: { index: false },
};

/**
 * Where a member lands when they sign in with a deletion pending (the
 * sign-in callback sends them here): the date, and Keep my account. Anyone
 * without a pending deletion is sent on to their settings, so the page is not
 * a place to wander into.
 *
 * Reads the session, so it is never cached. Its terminal twin is
 * `terminal/routes/account.ts`, which can only say where it is: a curl
 * request carries no session.
 */
export default async function AccountDeletionPage() {
  const { userId } = await requireDashboard();
  const pending = await getPendingDeletion(userId);
  if (!pending) redirect("/dashboard/profile");
  const linked = await getVerificationStatus(userId);

  return (
    <AccountDeletionPending
      scheduledFor={pending.scheduledFor}
      requestedByOfficer={pending.requestedByOfficer}
      started={pending.started}
      hasGithub={linked.verificationStatus.hasGithub}
      hasDiscord={linked.verificationStatus.hasDiscord}
      discordUrl={`https://discord.com/channels/${env.DISCORD_GUILD_ID}`}
    />
  );
}
