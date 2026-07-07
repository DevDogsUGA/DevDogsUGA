import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import AvatarField from "~/components/AvatarField";
import BioField from "~/components/BioField";
import { ConsoleCard } from "~/ui/card";
import DiscordField from "~/components/ConnectedAccountField/DiscordField";
import EmailField from "~/components/EmailField";
import Field from "~/ui/field";
import GithubField from "~/components/ConnectedAccountField/GithubField";
import GraduationDateField from "~/components/GraduationDateField";
import LinkedinField from "~/components/ConnectedAccountField/LinkedinField";
import PageHeader from "~/components/PageHeader";
import PreferredNameField from "~/components/PreferredNameField";
import ProfileLinks from "~/components/ProfileLinks";
import PronounsField from "~/components/PronounsField";
import RoleDescriptionField from "~/components/RoleDescriptionField";
import { CardSkeleton } from "~/components/Skeletons";
import VerificationStatusField from "~/components/VerificationStatusField";
import { getProfilePageData } from "~/server/loaders/console";

async function AccountContent() {
  const data = await getProfilePageData();

  return (
    <>
      <ConsoleCard.Root id="profile">
        <ConsoleCard.Header title="Profile" />
        <ConsoleCard.Content>
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
                  style={
                    role.roleColor
                      ? { backgroundColor: role.roleColor }
                      : { backgroundColor: "#6b7280" }
                  }
                >
                  {role.roleTitle}
                </span>
              ))}
            </div>
          </Field>
          {data.isLeader && (
            <Field
              id="roleDescription"
              label="Role Description"
              description="A short description of what you do, shown on the leadership section of the homepage."
            >
              <RoleDescriptionField {...data} />
            </Field>
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
      <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
        <AccentBlobs accent="amber" />

        <PageHeader
          title="Account"
          description="Manage your profile information, connected accounts, and verification status."
          accent="amber"
        />

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
      </div>
    </div>
  );
}
