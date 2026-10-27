import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { DownloadSimpleIcon, EyeIcon } from "@phosphor-icons/react/ssr";
import AcademicFields from "~/components/AcademicFields";
import DeleteAccountDialog from "~/components/AccountDeletion/DeleteAccountDialog";
import AvatarField from "~/components/AvatarField";
import BioField from "~/components/BioField";
import {
  discordUserName,
  githubUserName,
  linkedinName,
} from "~/components/ConnectedAccountField/identity";
import { FrozenFields, FrozenProfileNotice } from "~/components/FrozenProfile";
import GraduationDateField from "~/components/GraduationDateField";
import PreferredNameField from "~/components/PreferredNameField";
import ProfileLinks from "~/components/ProfileLinks";
import PronounsField from "~/components/PronounsField";
import PublicProfileSection from "~/components/PublicProfileSection";
import RoleDescriptionField from "~/components/RoleDescriptionField";
import SettingsShell from "~/components/Settings/SettingsShell";
import { Skeleton } from "~/ui/skeleton";
import { env } from "~/env";
import { profilePath } from "~/lib/profilePath";
import { publicProfilesEnabled } from "~/server/features";
import { getProfilePageData } from "~/server/loaders/console";
import { getHandleOptions } from "~/server/loaders/publicProfiles";
import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { PageHeading, Panel } from "~/ui/app-shell";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";

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

const PATH = "/settings/profile";

async function ProfileContent() {
  const data = await getProfilePageData();
  const handleChoices = publicProfilesEnabled()
    ? await getHandleOptions(data.id)
    : null;

  // Set by a moderator resolving a report with `quarantine`. Everything under
  // it is refused by RLS regardless; this is what stops the page pretending
  // otherwise. See ~/components/FrozenProfile.
  const frozen = Boolean(data.profile?.quarantinedBy);
  const Fields = frozen ? FrozenFields : Fragment;

  const publicLive =
    handleChoices?.current && data.isVerified && data.profile.publicProfile;

  return (
    <>
      <PageHeading
        title="Profile"
        description="Your details and what your public profile shows. Nothing changes until you press Save."
        actions={
          publicLive && handleChoices?.current ? (
            <Link
              className="btn secondary"
              href={profilePath(handleChoices.current)}
            >
              <EyeIcon aria-hidden />
              View public profile
            </Link>
          ) : undefined
        }
      />

      <Panel
        id="details"
        title="Your details"
        help="Shown across DevDogs instead of your legal name."
      >
        {frozen && <FrozenProfileNotice />}
        <Fields>
          <Field
            id="avatar"
            label="Profile Photo"
            description="Press your photo to change it. Shown on your public profile, the community page and anywhere else your account appears."
          >
            <div className="set-photo" style={{ marginBottom: 0 }}>
              <AvatarField {...data} />
            </div>
          </Field>
          <div className="set-grid" style={{ marginTop: 28 }}>
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
              description="Your expected graduation semester and year. Used to verify your student status; never shown publicly."
            >
              <GraduationDateField {...data} />
            </Field>
            <Field
              id="academics"
              label="Academics"
              description="Select all of your UGA programs of study, including majors, minors, graduate programs, and certificates. Never shown publicly."
            >
              <AcademicFields {...data} />
            </Field>
            <div className="full">
              <Field
                id="bio"
                label="Bio"
                description="A short description of yourself."
              >
                <BioField {...data} />
              </Field>
            </div>
          </div>
          <div style={{ marginTop: 28, maxWidth: 720 }}>
            <Field
              id="links"
              label="Links"
              description="Up to five links (a portfolio, a résumé, socials), shown on your public profile. Use the arrows to reorder."
            >
              <ProfileLinks initialLinks={data.profile.links} />
            </Field>
          </div>
        </Fields>
      </Panel>

      {handleChoices && (
        <Panel
          id="publicProfileSettings"
          title="Public profile"
          help="Lists you in the community directory and gives you a page at your handle. Turn it off and you are removed from both."
        >
          {/* Frozen like the profile fields: the switches are columns on
              platform."profile", which RLS refuses to a quarantined member. */}
          <Fields>
            <PublicProfileSection
              userId={data.id}
              settings={{
                ...handleChoices,
                isVerified: data.isVerified,
                switches: {
                  publicProfile: data.profile.publicProfile,
                  showName: data.profile.showName,
                  showAvatar: data.profile.showAvatar,
                  showBio: data.profile.showBio,
                  showLinks: data.profile.showLinks,
                  showStars: data.profile.showStars,
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
                    discordUserName(data.discordIdentity?.identityData) ?? null,
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
        </Panel>
      )}

      <Panel
        id="roles"
        title="Roles"
        help="Your roles within the club. Only officers can change these."
      >
        <Field id="roles-list" label="Your roles">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {data.userRoles.map((role) => (
              <Badge
                key={role.roleId}
                variant={role.roleTitle === "Member" ? "default" : "brand"}
              >
                {role.roleTitle}
              </Badge>
            ))}
          </div>
        </Field>
        {data.isLeader && (
          // Also a column on platform."profile", so also frozen. It renders
          // on the homepage, exactly the kind of thing a frozen member
          // should not be able to rewrite.
          <Fields>
            <div style={{ marginTop: 24 }}>
              <Field
                id="roleDescription"
                label="Role Description"
                description="A short description of what you do, shown under your name on your profile and on the leadership section of the homepage."
              >
                <RoleDescriptionField {...data} />
              </Field>
            </div>
          </Fields>
        )}
      </Panel>

      <Panel
        id="your-data"
        title="Your data"
        help="A JSON file of what the DevDogs platform keeps about you: your profile, linked accounts (never their sign-in tokens), roles, attendance, reflections, survey answers, support threads, OAuth apps, schedule builder plans and the audit events you caused. DogDays and DogPack are separate apps and hold their own data about you."
      >
        <Button asChild variant="secondary">
          <a href="/account/data" download>
            <DownloadSimpleIcon aria-hidden />
            Download my data
          </a>
        </Button>
      </Panel>

      {/* Outside Fields and the save bar on purpose: deleting is its own
          action with its own confirmation, and a frozen profile can still
          leave. */}
      <Panel
        id="delete-account"
        className="danger"
        title="Delete account"
        help="Schedules your account for deletion in 14 days. Until then you can sign in and keep it. When the time is up, your profile, reflections, survey answers and OAuth apps are erased, and your attendance stays in the club's totals without your name. It isn't part of Save."
      >
        <DeleteAccountDialog
          userId={data.id}
          hasGithub={Boolean(data.githubIdentity)}
          hasDiscord={Boolean(data.discordIdentity)}
          discordUrl={`https://discord.com/channels/${env.DISCORD_GUILD_ID}`}
        />
      </Panel>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your profile">
      <div className="pgh">
        <div>
          <h1>Profile</h1>
        </div>
      </div>
      <Skeleton className="h-64 w-full max-w-[720px]" />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <SettingsShell current={PATH}>
      {/* Every editable field on this page registers with the provider, and
          the bar at the bottom saves and resets all of them at once. It hides
          itself when nothing is dirty, so a quarantined profile never sees it:
          FrozenFields marks the whole subtree `inert`, so nothing is ever
          dirty. */}
      <SettingsFormProvider>
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileContent />
        </Suspense>
        <SettingsSaveBar />
      </SettingsFormProvider>
    </SettingsShell>
  );
}
