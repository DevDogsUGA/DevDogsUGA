"use client";

import Link from "next/link";
import { useState } from "react";
import HandlePicker from "~/components/HandlePicker";
import { usePublicProfileSwitches } from "~/hooks/usePublicProfileSwitches";
import { profilePath } from "~/lib/profilePath";
import { PUBLIC_PROFILE_FIELD_OPTIONS } from "~/lib/publicProfileFields";
import type { PublicProfileSettings } from "~/server/actions/publicProfile";
import Callout from "~/ui/callout";
import Field from "~/ui/field";
import VisibilityToggle from "~/ui/visibility-toggle";

/**
 * The /account controls for the public profile: the master switch, one switch
 * per part of the profile, and the handle. The GitHub, Discord and LinkedIn
 * switches stay with their accounts under Connected Accounts, and the email is
 * never public, so neither is repeated here.
 *
 * Whether the member is actually listed is the server's call (the
 * `publicProfiles` view); `live` below only mirrors its conditions to decide
 * whether a link to the page would work.
 */
export default function PublicProfileSection({
  settings,
}: {
  settings: PublicProfileSettings;
}) {
  const { switches, toggle, isPending } = usePublicProfileSwitches(
    settings.switches,
  );
  const [handle, setHandle] = useState(settings.current);

  const live = settings.isVerified && switches.publicProfile && handle !== null;

  return (
    <>
      {!settings.isVerified && (
        <Callout tone="info">
          These settings take effect once your profile is verified. Unverified
          accounts are never listed, whatever is set here.
        </Callout>
      )}

      <Field
        id="publicProfile"
        label="Display my profile publicly"
        description="Lists you in the community directory and gives you a page at your handle. Turn it off and you are removed from both."
      >
        <VisibilityToggle
          checked={switches.publicProfile}
          pending={isPending("publicProfile")}
          onToggle={() => toggle("publicProfile")}
          label="Public profile"
        />
        {live && handle && (
          <Link
            href={profilePath(handle)}
            className="w-fit text-sm text-cyan-300 underline hover:text-white"
          >
            View your public profile ({profilePath(handle)})
          </Link>
        )}
      </Field>

      <Field
        id="publicFields"
        label="What your profile shows"
        description="Choose which parts appear on your public page. GitHub, Discord and LinkedIn are set with each account under Connected Accounts."
      >
        <div className="flex flex-col gap-3">
          {PUBLIC_PROFILE_FIELD_OPTIONS.map(({ field, label, description }) => (
            <div key={field} className="flex flex-col gap-1">
              <VisibilityToggle
                checked={switches[field]}
                pending={isPending(field)}
                onToggle={() => toggle(field)}
                label={label}
              />
              <span className="text-xs text-mauve-400">{description}</span>
            </div>
          ))}
        </div>
      </Field>

      <Field
        id="handle"
        label="Handle"
        description="The address of your public profile."
      >
        <HandlePicker choices={settings} onSaved={setHandle} />
      </Field>
    </>
  );
}
