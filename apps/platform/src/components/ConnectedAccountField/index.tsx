"use client";

import type { ReactNode } from "react";
import { LinkBreakIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import { useCancelledUnload } from "~/hooks/useCancelledUnload";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";

interface ConnectedAccountFieldProps {
  /** The row's heading: "GitHub". */
  title: string;
  /** The provider's glyph, in the row's icon tile. */
  icon: ReactNode;
  /** The linked account's name, or undefined while nothing is linked. */
  accountName: string | undefined;
  /** What linking is for. */
  description: ReactNode;
  /** The "If you unlink:" consequence, shown only while linked. */
  unlinkEffect: ReactNode;
  linkAction: (formData: FormData) => void;
  unlinkAction: (formData: FormData) => Promise<void> | void;
  unlinkTitle: string;
  unlinkDescription: string;
  linkLabel: string;
  notLinkedLabel: string;
  displayPrefix?: string;
}

/**
 * One connected account (`.set-acc`, as in settings-accounts.html). Linking
 * and unlinking happen right away, so neither waits for a Save: unlinking asks
 * first behind a named dialog, linking leaves for the provider and comes back.
 */
export default function ConnectedAccountField({
  title,
  icon,
  accountName,
  description,
  unlinkEffect,
  linkAction,
  unlinkAction,
  unlinkTitle,
  unlinkDescription,
  linkLabel,
  notLinkedLabel,
  displayPrefix,
}: ConnectedAccountFieldProps) {
  const cancelledUnloads = useCancelledUnload();

  return (
    <div className="set-acc">
      <span className="ic" aria-hidden>
        {icon}
      </span>
      <div>
        <b>{title}</b>
        <span className="small muted">
          {accountName
            ? displayPrefix
              ? displayPrefix + accountName
              : accountName
            : notLinkedLabel}
        </span>
        <p className="why">{description}</p>
        {accountName && (
          <p className="why">
            <strong>If you unlink:</strong> {unlinkEffect}
          </p>
        )}
      </div>
      <div className="ctl">
        {accountName ? (
          <ConfirmDestructiveAction
            action={unlinkAction}
            title={`${unlinkTitle}?`}
            description={unlinkDescription}
            submitLabel={unlinkTitle}
          >
            <FormButton
              theme="black"
              type="submit"
              size="sm"
              aria-label={unlinkTitle}
            >
              <LinkBreakIcon aria-hidden />
              {unlinkTitle}…
            </FormButton>
          </ConfirmDestructiveAction>
        ) : (
          /* Keyed on the cancelled-departure count so the form is rebuilt
             whenever the member backs out of leaving.

             `linkAction` redirects to the OAuth provider, so submitting it is
             meant to be the last thing this document ever does: FormButton goes
             pending and stays pending. That is right until the member has unsaved
             changes, gets the browser's "Leave site?" prompt, and chooses to
             stay. The action then has nowhere to go and nothing resolves it, so
             the button sat there spinning and disabled, and the only way to link
             an account was a reload. Remounting throws the stuck transition away,
             and there is no in-progress input here to lose, just a hidden field
             and a button. */
          <form key={cancelledUnloads} className="contents" action={linkAction}>
            <input
              type="hidden"
              name="callbackPath"
              value="/dashboard/accounts"
            />
            <FormButton theme="black" size="sm">
              <PlusIcon aria-hidden />
              {linkLabel}
            </FormButton>
          </form>
        )}
      </div>
    </div>
  );
}
