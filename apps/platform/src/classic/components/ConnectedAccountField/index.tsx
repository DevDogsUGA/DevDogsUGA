"use client";

import type { ReactNode } from "react";
import { LinkBreakIcon } from "@phosphor-icons/react/ssr";
import { useCancelledUnload } from "~/hooks/useCancelledUnload";
import ConfirmDestructiveAction from "~/classic/ui/confirm-destructive-action";
import FormButton from "~/classic/components/FormButton";
import Input from "~/classic/components/Input";

interface ConnectedAccountFieldProps {
  /** The linked account's name, or undefined while nothing is linked. */
  accountName: string | undefined;
  /** The "If you unlink:" consequence, shown only while linked. */
  unlinkEffect: ReactNode;
  linkAction: (formData: FormData) => void;
  unlinkAction: (formData: FormData) => Promise<void> | void;
  unlinkTitle: string;
  unlinkDescription: string;
  linkLabel: string;
  linkIcon: ReactNode;
  notLinkedLabel: string;
  displayPrefix?: string;
}

/**
 * One connected account. Linking and unlinking happen right away, so neither
 * waits for a Save: unlinking asks first behind a named dialog, linking leaves
 * for the provider and comes back to the profile page.
 */
export default function ConnectedAccountField({
  accountName,
  unlinkEffect,
  linkAction,
  unlinkAction,
  unlinkTitle,
  unlinkDescription,
  linkLabel,
  linkIcon,
  notLinkedLabel,
  displayPrefix,
}: ConnectedAccountFieldProps) {
  const cancelledUnloads = useCancelledUnload();

  return (
    <div className="flex flex-col gap-3">
      {accountName ? (
        <>
          <Input
            className="max-w-sm"
            defaultValue={
              displayPrefix ? displayPrefix + accountName : accountName
            }
            readOnly
            disabled
            type="text"
          />
          <p className="max-w-sm text-xs text-balance text-mauve-300">
            <strong className="font-medium text-mauve-100">
              If you unlink:
            </strong>{" "}
            {unlinkEffect}
          </p>
          <div className="flex w-full max-w-sm justify-end">
            <ConfirmDestructiveAction
              action={unlinkAction}
              title={`${unlinkTitle}?`}
              description={unlinkDescription}
              submitLabel={unlinkTitle}
            >
              <FormButton
                theme="rose"
                type="submit"
                className="text-sm text-nowrap"
                aria-label={unlinkTitle}
              >
                <LinkBreakIcon aria-hidden />
                Unlink Account
              </FormButton>
            </ConfirmDestructiveAction>
          </div>
        </>
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
          <input type="hidden" name="callbackPath" value="/dashboard/profile" />
          <p className="text-sm text-mauve-400">{notLinkedLabel}</p>
          <FormButton theme="black" className="w-fit text-sm">
            {linkIcon}
            {linkLabel}
          </FormButton>
        </form>
      )}
    </div>
  );
}
