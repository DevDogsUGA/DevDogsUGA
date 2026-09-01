import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import AcademicFields from "~/components/AcademicFields";
import AvatarField from "~/components/AvatarField";
import BioField from "~/components/BioField";
import { ConsoleCard } from "~/ui/card";
import DiscordField from "~/components/ConnectedAccountField/DiscordField";
import EmailField from "~/components/EmailField";
import Field from "~/ui/field";
import { FrozenFields, FrozenProfileNotice } from "~/components/FrozenProfile";
import GithubField from "~/components/ConnectedAccountField/GithubField";
import GraduationDateField from "~/components/GraduationDateField";
import LinkedinField from "~/components/ConnectedAccountField/LinkedinField";
import PageShell from "~/components/PageShell";
import PreferredNameField from "~/components/PreferredNameField";
import ProfileLinks from "~/components/ProfileLinks";
import PronounsField from "~/components/PronounsField";
import RoleDescriptionField from "~/components/RoleDescriptionField";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";
import { CardSkeleton } from "~/components/Skeletons";
import VerificationStatusField from "~/components/VerificationStatusField";
import { getProfilePageData } from "~/server/loaders/console";

/**
 * One person's own profile. Nothing here is the same page for two visitors,
 * which is the whole reason for the `noindex`. There is no description on
 * purpose: a description exists to be shown in a result, and there should not
 * be a result.
 */
export const metadata: Metadata = {
  title: "Account | DevDogs",
  robots: { index: false },
};

async function AccountContent() {
  const data = await getProfilePageData();

  // Set by a moderator resolving a report with `quarantine`. Everything under
  // it is refused by RLS regardless; this is what stops the page pretending
  // otherwise. See ~/components/FrozenProfile.
  const frozen = Boolean(data.profile?.quarantinedBy);
  const Fields = frozen ? FrozenFields : Fragment;

  return (
    <>
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
              description="Your expected graduation semester and year — used to verify your student status."
            >
              <GraduationDateField {...data} />
            </Field>
            <Field
              id="academics"
              label="Academics"
              description="Select all of your UGA programs of study, including majors, minors, graduate programs, and certificates."
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
              description="Add up to five links (e.g., portfolio, resume, socials) to display on your public profile. Drag to reorder."
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
            description="Linking GitHub adds you to the DevDogs organization and grants access to this year's project repositories."
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
        </ConsoleCard.Content>
      </ConsoleCard.Root>

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
    </>
  );
}

export default function ProfilePage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="amber"
        title="Account"
        description="Manage your profile information, connected accounts, and verification status."
      >
        {/* Every editable field on this page registers with the provider, and
            the bar at the bottom saves and resets all of them at once. It
            hides itself when nothing is dirty, so a quarantined profile never
            sees it: FrozenFields marks the whole subtree `inert`, so no field
            can be edited and nothing is ever dirty.

            The bar is fixed to the bottom of the viewport, where
            AnnouncementBanner also sits. They cannot collide:
            `showsAnnouncement` keeps the notice off /account along with the
            rest of the signed-in pages, and announcement.test.ts pins that
            down. */}
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
            <AccountContent />
          </Suspense>
          <SettingsSaveBar />
        </SettingsFormProvider>
      </PageShell>
    </div>
  );
}
