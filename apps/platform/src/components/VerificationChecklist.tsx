import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import type { PropsWithChildren } from "react";
import { ArrowRightIcon, CheckIcon, InfoIcon, XIcon } from "@phosphor-icons/react/ssr";
import SyncPreferredNameButton from "~/components/SyncPreferredNameButton";

interface VerificationStatus {
  hasPronouns: boolean;
  hasGraduationDate: boolean;
  hasGithub: boolean;
  hasDiscord: boolean;
  nameMatchesInvolvement: boolean;
}

interface Props {
  userId: string;
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  involvementFullName: string | null;
  onNavigate?: () => void;
}

function CheckItem({
  met,
  href,
  onNavigate,
  children,
}: PropsWithChildren<{
  met: boolean;
  href?: string;
  onNavigate?: () => void;
}>) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={`mt-0.5 shrink-0 ${met ? "text-emerald-400" : "text-mauve-500"}`}
      >
        {met ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
      </span>
      <span
        className={`flex flex-1 items-start justify-between gap-2 ${met ? "text-white" : "text-mauve-400"}`}
      >
        <span>{children}</span>
        {!met && href && (
          <Link
            href={href}
            onClick={onNavigate}
            className="mt-px shrink-0 text-mauve-500 transition-colors hover:text-white"
            aria-label="Go to setting"
          >
            <ArrowRightIcon className="size-4" />
          </Link>
        )}
      </span>
    </li>
  );
}

function GroupLabel({ children }: PropsWithChildren) {
  return (
    <p className="text-xs font-semibold tracking-wide text-mauve-500 uppercase">
      {children}
    </p>
  );
}

export default function VerificationChecklist({
  userId,
  verificationStatus,
  isVerified,
  involvementFullName,
  onNavigate,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {isVerified && (
        <p className="text-sm font-medium text-emerald-300">
          Your profile is verified.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <GroupLabel>Become an official member</GroupLabel>
        <ul className="flex flex-col gap-2">
          <CheckItem met={involvementFullName !== null}>
            <span className="flex items-center gap-[1ch]">
              <span>
                Joined DevDogs on the{" "}
                <Link
                  className="underline hover:text-white"
                  href="https://uga.campuslabs.com/engage/organization/devdogs"
                  target="_blank"
                >
                  Involvement Network
                </Link>
              </span>
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={200}>
                  <Tooltip.Trigger className="text-base text-mauve-400 transition-colors hover:text-white">
                    <InfoIcon />
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    sideOffset={4}
                    className="max-w-64 rounded-sm border border-mauve-800 bg-mauve-700 px-2 py-1 text-center text-xs text-balance"
                  >
                    Involvement Network rosters are synced by hand on a
                    semi-regular basis. If you&rsquo;ve just joined DevDogs on
                    the Involvement Network, it may take some time to update.
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </span>
          </CheckItem>
          {involvementFullName !== null && (
            <CheckItem met={verificationStatus.nameMatchesInvolvement}>
              <span className="flex flex-col items-start gap-2">
                Involvement Network profile name matches DevDogs profile name.
                {!verificationStatus.nameMatchesInvolvement && (
                  <SyncPreferredNameButton
                    userId={userId}
                    involvementFullName={involvementFullName}
                  />
                )}
              </span>
            </CheckItem>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>Complete your profile</GroupLabel>
        <ul className="flex flex-col gap-2">
          <CheckItem
            met={verificationStatus.hasPronouns}
            href="/account#pronouns"
            onNavigate={onNavigate}
          >
            Pronouns added to your profile
          </CheckItem>
          <CheckItem
            met={verificationStatus.hasGraduationDate}
            href="/account#graduation"
            onNavigate={onNavigate}
          >
            Graduation date added to your profile
          </CheckItem>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>Start contributing</GroupLabel>
        <ul className="flex flex-col gap-2">
          <CheckItem
            met={verificationStatus.hasGithub}
            href="/account#github"
            onNavigate={onNavigate}
          >
            GitHub account linked
          </CheckItem>
          <CheckItem
            met={verificationStatus.hasDiscord}
            href="/account#discord"
            onNavigate={onNavigate}
          >
            Discord account linked
          </CheckItem>
        </ul>
      </div>
    </div>
  );
}
