import Link from "next/link";
import type { ReactNode } from "react";
import signOut from "~/server/actions/signOut";
import { logoLetter } from "~/server/oauth/consentScreen";
import { Card } from "~/ui/card";
import Callout from "~/ui/callout";
import "./consent-card.css";

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
    <Card className="cc-card">
      <div className="cc-head">
        {app.logoSrc ? (
          // The logo is ours (public storage); a remote image optimiser adds nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cc-logo" src={app.logoSrc} alt="" />
        ) : (
          <span className="avatar md" aria-hidden>
            {logoLetter(app.label)}
          </span>
        )}
        <div>
          <h1 className="display">Sign in to {app.label}</h1>
          <p className="cc-by">by {app.registrant ?? "DevDogs"}</p>
        </div>
      </div>

      {links.length > 0 && (
        <ul className="cc-links">
          {links.map((link) => (
            <li key={link.href}>
              <a
                className="textlink"
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

      <div className="cc-who">
        <div>
          <span>Signed in as</span>
          <b>{account.name}</b>
          {account.email && account.email !== account.name && (
            <span>{account.email}</span>
          )}
        </div>
        {testing ? (
          <Link className="textlink" href={notYouPath}>
            Not you?
          </Link>
        ) : (
          <form action={signOut}>
            <input type="hidden" name="callbackPath" value={notYouPath} />
            <button type="submit" className="textlink">
              Not you?
            </button>
          </form>
        )}
      </div>

      <p className="cc-lead">{app.label} will get:</p>
      <ul className="cc-fields">
        {fields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>

      <p className="cc-return">
        After this you go to <b>{host}</b>.
      </p>

      {children}

      {testing && (
        <p className="help cc-note">
          This app is in testing. Only you and your test accounts can sign in.
        </p>
      )}
    </Card>
  );
}

/** The card shown when a test account is signed in to an app in production. */
export function ConsentRefusedCard({
  authorizationId,
}: {
  authorizationId: string;
}) {
  return (
    <Card className="cc-card">
      <h1 className="display" style={{ fontSize: 24, margin: "0 0 12px" }}>
        This account can&apos;t sign in here
      </h1>
      <Callout tone="critical">
        You&apos;re signed in as a test account, and this app is in production.
        Apps in production only sign in real members. Sign out, then sign in as
        yourself.
      </Callout>
      <form action={signOut} style={{ marginTop: 16 }}>
        <input
          type="hidden"
          name="callbackPath"
          value={`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`}
        />
        <button type="submit" className="textlink">
          Sign out
        </button>
      </form>
    </Card>
  );
}
