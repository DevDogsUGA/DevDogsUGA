"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import HandlePicker from "~/components/HandlePicker";
import { usePublicProfileSwitches } from "~/hooks/usePublicProfileSwitches";
import { profilePath } from "~/lib/profilePath";
import {
  getPublicProfileSettings,
  type PublicProfileSettings,
} from "~/server/actions/publicProfile";
import VisibilityToggle from "~/ui/visibility-toggle";

/**
 * The last step of the verification checklist: once a member is verified,
 * their profile is public by default, so the dialog says so and offers the
 * way out and the handle choice right there. The default comes with notice;
 * /account holds the rest of the controls and is linked from here.
 *
 * The dialog sits in the navbar and has no page to hand it data, so the
 * settings are read through a server action, and only when this step renders
 * (an unverified member never loads them). The action answers null while
 * public profiles are switched off, and the step then renders nothing.
 */
export default function PublicProfileStep({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { data, isError } = useQuery({
    queryKey: ["publicProfileSettings"],
    queryFn: getPublicProfileSettings,
    // Always re-read on open: the handle or switches may have changed on
    // /account since the dialog last showed.
    staleTime: 0,
  });

  if (data === null) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-mauve-800 pt-4">
      <p className="pb-0.5 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
        Your public profile
      </p>
      {data ? (
        <StepBody settings={data} onNavigate={onNavigate} />
      ) : isError ? (
        <p className="text-sm text-rose-300">
          Could not load your profile settings. Close this and try again.
        </p>
      ) : (
        <p className="text-sm text-mauve-400">Loading…</p>
      )}
    </div>
  );
}

function StepBody({
  settings,
  onNavigate,
}: {
  settings: PublicProfileSettings;
  onNavigate?: () => void;
}) {
  const { switches, toggle, isPending } = usePublicProfileSwitches(
    settings.switches,
  );
  const [handle, setHandle] = useState(settings.current);

  return (
    <>
      <p className="text-sm text-white">
        {switches.publicProfile
          ? handle
            ? `Your profile will be public at ${profilePath(handle)}, and you will appear in the community directory.`
            : "Your profile will be public and listed in the community directory once you choose a handle below."
          : "Your profile is private. It will not appear in the community directory."}
      </p>
      <VisibilityToggle
        checked={switches.publicProfile}
        pending={isPending("publicProfile")}
        onToggle={() => toggle("publicProfile")}
        label="Public profile"
      />
      <HandlePicker choices={settings} onSaved={setHandle} />
      <p className="text-xs text-mauve-400">
        Choose what appears, and change any of this later, under{" "}
        <Link
          href="/account#publicProfile"
          onClick={onNavigate}
          className="underline hover:text-white"
        >
          Account
        </Link>
        .
      </p>
    </>
  );
}
