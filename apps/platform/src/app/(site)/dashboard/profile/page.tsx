import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import { DownloadSimpleIcon } from "@phosphor-icons/react/ssr";
import AcademicFields from "~/classic/components/AcademicFields";
import DeleteAccountDialog from "~/classic/components/AccountDeletion/DeleteAccountDialog";
import AvatarField from "~/classic/components/AvatarField";
import BioField from "~/classic/components/BioField";
import {
  discordUserName,
  githubUserName,
  linkedinName,
} from "~/classic/components/ConnectedAccountField/identity";
import DiscordField from "~/classic/components/ConnectedAccountField/DiscordField";
import EmailField from "~/classic/components/EmailField";
import {
  FrozenFields,
  FrozenProfileNotice,
} from "~/classic/components/FrozenProfile";
import GithubField from "~/classic/components/ConnectedAccountField/GithubField";
import GraduationDateField from "~/classic/components/GraduationDateField";
import LinkedinField from "~/classic/components/ConnectedAccountField/LinkedinField";
import PageShell from "~/classic/components/PageShell";
import PreferredNameField from "~/classic/components/PreferredNameField";
import ProfileLinks from "~/classic/components/ProfileLinks";
import PronounsField from "~/classic/components/PronounsField";
import PublicProfileSection from "~/classic/components/PublicProfileSection";
import RoleDescriptionField from "~/classic/components/RoleDescriptionField";
import ConnectedAppsField from "~/classic/components/Settings/ConnectedAppsField";
import { CardSkeleton } from "~/classic/components/Skeletons";
import VerificationStatusField from "~/classic/components/VerificationStatusField";
import { ConsoleCard } from "~/classic/ui/card";
import Callout from "~/classic/ui/callout";
import Field from "~/classic/ui/field";
import { SettingsFormProvider } from "~/classic/ui/settings-form";
import SettingsSaveBar from "~/classic/ui/settings-save-bar";
import { env } from "~/env";
import { publicProfilesEnabled } from "~/server/features";
import { getProfilePageData } from "~/server/loaders/console";
import { getHandleOptions } from "~/server/loaders/publicProfiles";
import { getConnectedApps } from "~/server/loaders/oauthApps";

/**
 * One person's own profile. Nothing here is the same page for two visitors,
 * which is the whole reason for the `noindex`. There is no description on
 * purpose: a description exists to be shown in a result, and there should not
 * be a result.
 */
export const metadata: Metadata = {
  title: "Profile | Settings | DevDogs",
  robots: { index: false },
};

type Params = Record<string, string | string[] | undefined>;

async function ProfileContent({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const [data, connectedApps, params] = await Promise.all([
    getProfilePageData(),
    getConnectedApps(),
    searchParams,
  ]);
  const handleChoices = publicProfilesEnabled()
    ? await getHandleOptions(data.id)
    : null;

  // Set by a moderator resolving a report with `quarantine`. Everything under
  // it is refused by RLS regardless; this is what stops the page pretending
  // otherwise. See ~/classic/components/FrozenProfile.
  const frozen = Boolean(data.profile?.quarantinedBy);
  const Fields = frozen ? FrozenFields : Fragment;

  return (
    <>
      <ConnectedAccountStatus params={params} />
      <ConsoleCard.Root id="profile">
        <ConsoleCard.Header title="Profile" />
        <ConsoleCard.Content>
          {frozen && <FrozenProfileNotice />}
          <Fields>
            <Field
              id="avatar"
              label="Profile Photo"
              description="Shown on your public profile, the community page, and anywhere else your account appears."
            >
              <AvatarField {...data} />
            </Field>
            <Field
              id="preferredName"
              label="Preferred Name"
              description="Displayed across DevDogs instead of your legal name."
            >
              <PreferredNameField {...data} />
            </Field>
            <Field
              id="pronouns"
              label="Pronouns"
              description="Select from common options or add your own. Shown on your public profile."
            >
              <PronounsField {...data} />
            </Field>
            <Field
              id="graduation"
              label="Graduation"
              description="Your expected graduation semester and year — used to verify your student status. Only the year is shown on your public profile."
            >
              <GraduationDateField {...data} />
            </Field>
            <Field
              id="academics"
              label="Academics"
              description="Select all of your UGA programs of study, including majors, minors, graduate programs, and certificates. Your majors (not minors or certificates) are shown on your public profile."
            >
              <AcademicFields {...data} />
            </Field>
            <Field
              id="bio"
              label="Bio"
              description="A short description of yourself."
            >
              <BioField {...data} />
            </Field>
            <Field
              id="links"
              label="Links"
              description="Add up to five links (e.g., portfolio, resume, socials) to display on your public profile. Use the arrows to reorder."
            >
              <ProfileLinks initialLinks={data.profile.links} />
            </Field>
          </Fields>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="connectedAccounts">
        <ConsoleCard.Header title="Connected Accounts" />
        <ConsoleCard.Content>
          <Field
            id="email"
            label="UGA MyID Email"
            description="Obtained via UGA SSO and used for sign-in. This can't be changed here."
          >
            <EmailField {...data} />
          </Field>
          <Field
            id="github"
            label="GitHub"
            description="Linking GitHub is part of verifying your account and is needed to create an OAuth client for testing DevDogs sign-in. You contribute from your own fork, so it does not add you to the DevDogs organization."
          >
            <GithubField {...data} />
          </Field>
          <Field
            id="discord"
            label="Discord"
            description="Linking Discord adds you to the DevDogs Discord server."
          >
            <DiscordField {...data} />
          </Field>
          <Field
            id="linkedin"
            label="LinkedIn"
            description="Link your LinkedIn profile to display it on your public profile."
          >
            <LinkedinField {...data} />
          </Field>
          <Field
            id="connected-apps"
            label="Connected apps"
            description="Apps you have approved to sign you in with DevDogs. Remove access to sign out of one app and make it ask again."
          >
            <ConnectedAppsField apps={connectedApps} userId={data.id} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {handleChoices && (
        <ConsoleCard.Root id="publicProfileSettings">
          <ConsoleCard.Header title="Public Profile" />
          <ConsoleCard.Content>
            {/* Frozen like the profile fields: the switches are columns on
              platform."profile", which RLS refuses to a quarantined member. */}
            <Fields>
              <PublicProfileSection
                settings={{
                  ...handleChoices,
                  isVerified: data.isVerified,
                  switches: {
                    publicProfile: data.profile.publicProfile,
                    showName: data.profile.showName,
                    showAvatar: data.profile.showAvatar,
                    showBio: data.profile.showBio,
                    showLinks: data.profile.showLinks,
                    showContributions: data.profile.showContributions,
                  },
                }}
                accounts={[
                  {
                    provider: "github",
                    label: "GitHub",
                    name:
                      githubUserName(data.githubIdentity?.identityData) ?? null,
                    show: data.profile.showGithub,
                  },
                  {
                    provider: "discord",
                    label: "Discord",
                    name:
                      discordUserName(data.discordIdentity?.identityData) ??
                      null,
                    show: data.profile.showDiscord,
                  },
                  {
                    provider: "linkedin",
                    label: "LinkedIn",
                    name:
                      linkedinName(data.linkedinIdentity?.identityData) ?? null,
                    show: data.profile.showLinkedin,
                  },
                ]}
              />
            </Fields>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      <ConsoleCard.Root id="status">
        <ConsoleCard.Header title="Status" />
        <ConsoleCard.Content>
          <Field
            id="roles"
            label="Roles"
            description="Your roles within the club. Only officers can change these."
          >
            <div className="flex flex-wrap gap-2">
              {data.userRoles.map((role) => (
                <span
                  key={role.roleId}
                  className="rounded-sm px-2 py-1 text-sm font-medium text-white"
                  // mauve-800 when a role has no colour of its own;
                  // `text-white` above keeps the label legible either way,
                  // including against a dark custom colour. Tested for
                  // emptiness rather than `??`-ed: the column is nullable AND
                  // free text, so "" is reachable and would otherwise reach
                  // `backgroundColor` and paint the chip transparent.
                  style={{
                    backgroundColor: role.roleColor?.trim()
                      ? role.roleColor
                      : "#2a212c",
                  }}
                >
                  {role.roleTitle}
                </span>
              ))}
            </div>
          </Field>
          {data.isLeader && (
            // Also a column on platform."profile", so also frozen. It renders
            // on the homepage, exactly the kind of thing a frozen member
            // should not be able to rewrite.
            <Fields>
              <Field
                id="roleDescription"
                label="Role Description"
                description="A short description of what you do, shown on the leadership section of the homepage."
              >
                <RoleDescriptionField {...data} />
              </Field>
            </Fields>
          )}
          <Field
            id="verification"
            label="Profile Verification"
            description="Complete all the steps below for your profile to appear on the DevDogs community page."
          >
            <VerificationStatusField />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {/* The privacy policy tells members to use both of these ("Download my
          data" and "Delete account in Settings, under Profile"). Outside
          Fields on purpose: neither is part of Save, and a frozen profile can
          still download its data and leave. */}
      <ConsoleCard.Root id="your-data">
        <ConsoleCard.Header title="Your Data" />
        <ConsoleCard.Content>
          <Field
            id="download-data"
            label="Download my data"
            description="A JSON file of what the DevDogs platform keeps about you: your profile, linked accounts (never their sign-in tokens), roles, attendance, reflections, survey answers, support threads, OAuth apps, schedule builder plans and the audit events you caused. DogDays and DogPack are separate apps and hold their own data about you."
          >
            <a
              href="/account/data"
              download
              className="relative flex w-fit items-center justify-center gap-[1ch] rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
            >
              <DownloadSimpleIcon aria-hidden />
              Download my data
            </a>
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="delete-account">
        <ConsoleCard.Header title="Delete Account" />
        <ConsoleCard.Content>
          <Field
            id="delete"
            label="Delete account"
            description="Schedules your account for deletion in 14 days. Until then you can sign in and keep it. When the time is up, your profile, reflections, survey answers and OAuth apps are erased, and your attendance stays in the club's totals without your name. It isn't part of Save."
          >
            <DeleteAccountDialog
              userId={data.id}
              hasGithub={Boolean(data.githubIdentity)}
              hasDiscord={Boolean(data.discordIdentity)}
              discordUrl={`https://discord.com/channels/${env.DISCORD_GUILD_ID}`}
            />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </>
  );
}

export default function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="amber"
        title="Profile"
        description="Manage your profile information, connected accounts, and verification status."
      >
        {/* Every editable field on this page registers with the provider, and
            the bar at the bottom saves and resets all of them at once. It
            hides itself when nothing is dirty, so a quarantined profile never
            sees it: FrozenFields marks the whole subtree `inert`, so no field
            can be edited and nothing is ever dirty.

            The bar is fixed to the bottom of the viewport, where
            AnnouncementBanner also sits. They cannot collide:
            `showsAnnouncement` keeps the notice off the signed-in pages. */}
        <SettingsFormProvider>
          <Suspense
            fallback={
              <>
                <CardSkeleton rows={6} />
                <CardSkeleton rows={4} />
                <CardSkeleton rows={2} />
              </>
            }
          >
            <ProfileContent searchParams={searchParams} />
          </Suspense>
          <SettingsSaveBar />
        </SettingsFormProvider>
      </PageShell>
    </div>
  );
}

/** What the link round trip reported, as the three results the page can show. */
function ConnectedAccountStatus({ params }: { params: Params }) {
  const level = params.connectedAccountStatus;
  const code = params.connectedAccountCode;
  const provider = params.connectedAccountProvider;
  if (typeof level !== "string" || typeof code !== "string") return null;

  const providerName =
    provider === "github"
      ? "GitHub"
      : provider === "discord"
        ? "Discord"
        : provider === "linkedin_oidc"
          ? "LinkedIn"
          : "That account";
  const message =
    code === "identity_already_exists"
      ? `${providerName} profile is already linked to a DevDogs account. If it does not appear below, sign in to the other account and unlink it first, or contact an officer for help.`
      : code === "external_side_effect_failed"
        ? `${providerName} was linked, but its server membership could not be updated. Your connected account is safe; an officer can retry the membership update.`
        : `${providerName} could not be linked. Please try again or contact an officer if the problem continues.`;

  return (
    <Callout tone={level === "warning" ? "warning" : "critical"} alert>
      {message}
    </Callout>
  );
}
