import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  DiscordLogoIcon,
  GithubLogoIcon,
  GraduationCapIcon,
  IdentificationCardIcon,
  InfoIcon,
  SealCheckIcon,
  UserIcon,
  UsersIcon,
} from "@phosphor-icons/react/ssr";
import Badge from "~/ui/badge";
import PublicProfileStep from "~/components/PublicProfileStep";
import SyncPreferredNameButton from "~/components/SyncPreferredNameButton";
import { INVOLVEMENT_NETWORK_URL } from "~/config/nav";

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
  /** The dialog's closing step; the accounts page leaves it to Profile. */
  showPublicProfile?: boolean;
}

/**
 * One step: an icon, what it is, and either a check (done) or a link to the
 * place that finishes it (`.vrow`, as in settings-accounts.html).
 */
function Step({
  met,
  icon,
  href,
  action,
  onNavigate,
  children,
  detail,
}: PropsWithChildren<{
  met: boolean;
  icon: ReactNode;
  href?: string;
  /** The link's words. */
  action?: string;
  onNavigate?: () => void;
  detail?: ReactNode;
}>) {
  return (
    <li className="vrow flex-wrap">
      <span className="ic" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <b>{children}</b>
        {detail}
      </div>
      {met ? (
        <CheckCircleIcon
          weight="bold"
          className="st"
          role="img"
          aria-label="Done"
        />
      ) : href ? (
        <Link
          href={href}
          onClick={onNavigate}
          className="textlink ml-auto flex items-center gap-1.5 text-[13.5px]"
        >
          {action}
          <ArrowRightIcon aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}

export default function VerificationChecklist({
  userId,
  verificationStatus,
  isVerified,
  involvementFullName,
  onNavigate,
  showPublicProfile = true,
}: Props) {
  const joined = involvementFullName !== null;
  const steps = [
    joined,
    ...(joined ? [verificationStatus.nameMatchesInvolvement] : []),
    verificationStatus.hasPronouns,
    verificationStatus.hasGraduationDate,
    verificationStatus.hasGithub,
    verificationStatus.hasDiscord,
  ];
  const done = steps.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="row" style={{ gap: 12 }}>
        {isVerified ? (
          <Badge variant="success">
            <SealCheckIcon aria-hidden />
            Verified
          </Badge>
        ) : (
          <Badge>Not verified</Badge>
        )}
        <span className="small muted">
          {done} of {steps.length} steps complete
        </span>
      </div>

      <ul>
        <Step
          met={joined}
          icon={<UsersIcon />}
          detail={
            <span className="small muted inline-flex items-center gap-1.5">
              Rosters are synced by hand, so a new join can take a while to show
              up.
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={200}>
                  <Tooltip.Trigger
                    aria-label="About roster syncing"
                    className="text-base text-[var(--text-3)] hover:text-[var(--text)]"
                  >
                    <InfoIcon />
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    sideOffset={4}
                    className="lb max-w-64 px-2.5 py-1.5 text-center text-xs text-balance"
                  >
                    Involvement Network rosters are synced by hand on a
                    semi-regular basis. If you&rsquo;ve just joined DevDogs on
                    the Involvement Network, it may take some time to update.
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </span>
          }
          href={INVOLVEMENT_NETWORK_URL}
          action="Join"
        >
          Joined DevDogs on the Involvement Network
        </Step>
        {joined && (
          <Step
            met={verificationStatus.nameMatchesInvolvement}
            icon={<IdentificationCardIcon />}
            detail={
              !verificationStatus.nameMatchesInvolvement ? (
                <span className="mt-2 flex">
                  <SyncPreferredNameButton
                    userId={userId}
                    involvementFullName={involvementFullName}
                  />
                </span>
              ) : (
                <span className="small muted">{involvementFullName}</span>
              )
            }
          >
            Name matches the Involvement Network
          </Step>
        )}
        <Step
          met={verificationStatus.hasPronouns}
          icon={<UserIcon />}
          href="/dashboard/profile#pronouns"
          action="Add on Profile"
          onNavigate={onNavigate}
        >
          Add your pronouns
        </Step>
        <Step
          met={verificationStatus.hasGraduationDate}
          icon={<GraduationCapIcon />}
          href="/dashboard/profile#graduation"
          action="Add on Profile"
          onNavigate={onNavigate}
        >
          Add your graduation date
        </Step>
        <Step
          met={verificationStatus.hasGithub}
          icon={<GithubLogoIcon />}
          href="/dashboard/accounts#github"
          action="Link GitHub"
          onNavigate={onNavigate}
        >
          Link GitHub
        </Step>
        <Step
          met={verificationStatus.hasDiscord}
          icon={<DiscordLogoIcon />}
          href="/dashboard/accounts#discord"
          action="Link Discord"
          onNavigate={onNavigate}
        >
          Link Discord
        </Step>
      </ul>

      {isVerified && showPublicProfile && (
        <PublicProfileStep onNavigate={onNavigate} />
      )}
    </div>
  );
}
