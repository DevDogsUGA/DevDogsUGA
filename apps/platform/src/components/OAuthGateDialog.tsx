"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { LockIcon } from "@phosphor-icons/react/ssr";
import oauthAction from "~/server/actions/oauth";
import FormButton from "~/components/FormButton";
import {
  Dialog,
  DialogDescription,
  DialogPortal,
  DialogTitle,
} from "~/ui/dialog";

interface Props {
  clientId: string | null;
  hasGithub: boolean;
}

export default function OAuthGateDialog({
  clientId: initialClientId,
  hasGithub,
}: Props) {
  const [{ clientId }, dispatch, isPending] = useActionState(oauthAction, {
    clientId: initialClientId,
    clientSecret: null,
    redirectUris: [],
    reportApiKey: null,
    webhookSecret: null,
    reportWebhookUrl: null,
  });

  // Portal into the layout's scroll container so the overlay covers every
  // section on the page without also covering the sidebar.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const open = clientId === null;

  useEffect(() => {
    setContainer(document.getElementById("main-content"));
  }, []);

  useEffect(() => {
    if (!open || !container) return;

    const previousOverflow = container.style.overflow;
    container.style.overflow = "hidden";

    return () => {
      container.style.overflow = previousOverflow;
    };
  }, [open, container]);

  if (!open || !container) return null;

  return (
    <Dialog open onOpenChange={() => {}} modal={false}>
      <DialogPortal container={container}>
        <div
          className="absolute inset-0 z-50 bg-mauve-950/65 backdrop-blur-sm"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent, transparent 5rem, black 12rem)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, transparent 5rem, black 12rem)",
          }}
          onClick={() =>
            contentRef.current?.querySelector<HTMLElement>("button, a")?.focus()
          }
        />
        <DialogPrimitive.Content
          ref={contentRef}
          className="absolute inset-0 z-50 flex items-center justify-center p-4 outline-none"
        >
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-mauve-700 bg-mauve-900 px-6 py-6 text-center text-mauve-300 shadow-xl shadow-black/40">
            <span className="text-3xl text-cyan-400">
              <LockIcon />
            </span>

            <DialogTitle className="text-lg font-semibold text-white">
              Enable OAuth to continue
            </DialogTitle>

            <DialogDescription className="max-w-prose text-sm text-balance">
              {hasGithub
                ? "This tool requires a local OAuth client. Enable OAuth to generate credentials and unlock this page."
                : "This tool requires a local OAuth client. Link a GitHub account to enable OAuth and unlock this page."}
            </DialogDescription>

            {hasGithub ? (
              <form action={dispatch}>
                <input type="hidden" name="intent" value="toggle-client" />
                <FormButton
                  theme="cyan"
                  type="submit"
                  disabled={isPending}
                  className="text-sm focus-visible:ring-offset-mauve-900"
                >
                  Enable OAuth
                </FormButton>
              </form>
            ) : (
              <Link
                href="/account#connectedAccounts"
                className="rounded-sm border-2 border-cyan-400 bg-cyan-400 px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-mauve-950 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900"
              >
                Link GitHub Account
              </Link>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
