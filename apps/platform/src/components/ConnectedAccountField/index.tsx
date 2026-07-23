"use client";

import type { ReactNode } from "react";
import { LinkBreakIcon } from "@phosphor-icons/react/ssr";
import { useAccountVisibility } from "~/hooks/useAccountVisibility";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import VisibilityToggle from "~/ui/visibility-toggle";

type Provider = "github" | "discord" | "linkedin";

interface ConnectedAccountFieldProps {
  userId: string;
  accountName: string | undefined;
  provider: Provider;
  visibilityState: {
    showGithub: boolean;
    showDiscord: boolean;
    showEmail: boolean;
    showLinkedin: boolean;
  };
  linkAction: (formData: FormData) => void;
  unlinkAction: (formData: FormData) => Promise<void> | void;
  unlinkTitle: string;
  unlinkDescription: string;
  linkLabel: string;
  linkIcon: ReactNode;
  notLinkedLabel: string;
  displayPrefix?: string;
}

const VISIBILITY_KEY: Record<Provider, "showGithub" | "showDiscord" | "showLinkedin"> = {
  github: "showGithub",
  discord: "showDiscord",
  linkedin: "showLinkedin",
};

export default function ConnectedAccountField({
  userId,
  accountName,
  provider,
  visibilityState,
  linkAction,
  unlinkAction,
  unlinkTitle,
  unlinkDescription,
  linkLabel,
  linkIcon,
  notLinkedLabel,
  displayPrefix,
}: ConnectedAccountFieldProps) {
  const visibility = useAccountVisibility(userId, visibilityState);
  const visKey = VISIBILITY_KEY[provider];

  return (
    <div className="flex flex-col gap-3">
      {accountName ? (
        <>
          <VisibilityToggle
            checked={visibility[visKey]}
            pending={visibility.isPending(provider)}
            onToggle={() => visibility.toggle(provider)}
          />
          <Input
            className="max-w-sm"
            defaultValue={displayPrefix ? displayPrefix + accountName : accountName}
            readOnly
            disabled
            type="text"
          />
          <div className="flex w-full max-w-sm justify-end">
            <ConfirmDestructiveAction
              action={unlinkAction}
              title={unlinkTitle}
              description={unlinkDescription}
              submitLabel={unlinkTitle}
              userConfirmText={unlinkTitle}
            >
              <FormButton
                theme="rose"
                type="submit"
                className="text-sm text-nowrap"
              >
                <LinkBreakIcon />
                Unlink Account
              </FormButton>
            </ConfirmDestructiveAction>
          </div>
        </>
      ) : (
        <form className="contents" action={linkAction}>
          <input type="hidden" name="callbackPath" value="/account" />
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
