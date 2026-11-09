import Link from "next/link";
import type { ReactNode } from "react";
import AuthCard from "~/classic/components/AuthCard";
import Callout from "~/classic/ui/callout";
import signOut from "~/server/actions/signOut";
import { logoLetter } from "~/server/oauth/consentScreen";

export interface ConsentCardApp {
  label: string;
  /** Public URL of the uploaded logo, or null for a letter tile. */
  logoSrc: string | null;
  homepageUrl: string | null;
  privacyPolicyUrl: string | null;
  /** The owner's display name, or null for a DevDogs app. */
  registrant: string | null;
}

interface ConsentCardProps {
  app: ConsentCardApp;
  account: { name: string; email: string | null };
  /** What the app receives, in plain words. */
  fields: readonly string[];
  /** The validated host the member returns to. */
  host: string;
  authorizationId: string;
  /** A Testing app: "Not you?" goes back to the account picker. */
  testing: boolean;
  /** Allow and Cancel. */
  children: ReactNode;
}

const LINK =
  "rounded-xs text-sm text-mauve-400 underline transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";

/**
 * The consent card: who is asking, who is signed in, exactly what is shared,
 * and where the member goes next. Presentational and server-rendered; the
 * buttons come in as `children`. Every string that came from an app's
 * registration is rendered as text, never as markup, and the links only ever
 * carry the `https` addresses the database check allows.
 */
export default function ConsentCard({
  app,
  account,
  fields,
  host,
  authorizationId,
  testing,
  children,
}: ConsentCardProps) {
  const links = [
    app.homepageUrl && { href: app.homepageUrl, text: "Website" },
    app.privacyPolicyUrl && {
      href: app.privacyPolicyUrl,
      text: "Privacy policy",
    },
  ].filter((link) => !!link);
  const notYouPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;

  return (
    <AuthCard className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        {app.logoSrc ? (
          // The logo is ours (public storage); a remote image optimiser adds nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="size-12 shrink-0 rounded-md object-cover"
            src={app.logoSrc}
            alt=""
          />
        ) : (
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-md bg-mauve-700 text-lg font-semibold text-white"
          >
            {logoLetter(app.label)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-white">
            Sign in to {app.label}
          </h1>
          <p className="mt-1 text-sm text-mauve-400">
            by {app.registrant ?? "DevDogs"}
          </p>
        </div>
      </div>

      {links.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((link) => (
            <li key={link.href}>
              <a
                className={LINK}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.text}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-mauve-400">Signed in as</span>
          <b className="truncate font-medium text-white">{account.name}</b>
          {account.email && account.email !== account.name && (
            <span className="truncate text-mauve-400">{account.email}</span>
          )}
        </div>
        {testing ? (
          <Link className={LINK} href={notYouPath}>
            Not you?
          </Link>
        ) : (
          <form action={signOut}>
            <input type="hidden" name="callbackPath" value={notYouPath} />
            <button type="submit" className={LINK}>
              Not you?
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-2 text-sm text-mauve-300">
        <p>{app.label} will get:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {fields.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-mauve-400">
        After this you go to <b className="font-medium text-white">{host}</b>.
      </p>

      {children}

      {testing && (
        <p className="text-xs text-mauve-400">
          This app is in testing. Only you and your test accounts can sign in.
        </p>
      )}
    </AuthCard>
  );
}

/** The card shown when a test account is signed in to an app in production. */
export function ConsentRefusedCard({
  authorizationId,
}: {
  authorizationId: string;
}) {
  return (
    <AuthCard className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-white">
        This account can&apos;t sign in here
      </h1>
      <Callout tone="critical">
        You&apos;re signed in as a test account, and this app is in production.
        Apps in production only sign in real members. Sign out, then sign in as
        yourself.
      </Callout>
      <form action={signOut}>
        <input
          type="hidden"
          name="callbackPath"
          value={`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`}
        />
        <button type="submit" className={LINK}>
          Sign out
        </button>
      </form>
    </AuthCard>
  );
}
