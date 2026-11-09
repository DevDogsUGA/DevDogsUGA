"use client";

import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { useState } from "react";
import { requestAccountDeletion } from "~/server/actions/accountDeletion";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/classic/ui/alert-dialog";
import FormButton from "~/classic/components/FormButton";
import Input from "~/classic/components/Input";
import Field from "~/classic/ui/field";
import { TextLink } from "~/classic/ui/text-link";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";
import { confirmationMatches, DELETE_PHRASE } from "./confirm";
import LeaveLinks from "./LeaveLinks";

/**
 * Settings → Profile → Delete account. Opens the confirmation (account-deletion
 * Q4, Q5, Q43): what the deletion removes and keeps, the 14-day window, links
 * to leave GitHub and Discord, an offer to download the data first, and a
 * typed confirmation. Confirming schedules the deletion with the member as the
 * actor and sends them to the pending page; a refusal (the sole President)
 * stays in the dialog with its message.
 */
export default function DeleteAccountDialog({
  userId,
  hasGithub,
  hasDiscord,
  discordUrl,
  navigate = (url) => window.location.assign(url),
}: {
  userId: string;
  hasGithub: boolean;
  hasDiscord: boolean;
  discordUrl: string;
  /** Where the browser goes once the deletion is scheduled; a test passes its own. */
  navigate?: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  // No refresh: the request signs the member out, so there is no page to redraw.
  const {
    run,
    pending,
    result: lastResult,
  } = useCommand(
    async () => {
      const result = await requestAccountDeletion(userId);
      // The request signed the member out of every session; the pending
      // page is where they land.
      if (result.ok) navigate("/dashboard/deletion");
      return result;
    },
    { refresh: false },
  );
  // A refusal belongs to the opening it happened in: reopening starts clean.
  const [staleResult, setStaleResult] = useState(lastResult);
  const result = lastResult === staleResult ? null : lastResult;

  const confirmed = confirmationMatches(typed, DELETE_PHRASE);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    setTyped("");
    setStaleResult(lastResult);
  }

  function confirm() {
    if (!confirmed) return;
    run();
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <FormButton theme="rose" type="button" className="w-fit text-sm">
          <TrashIcon aria-hidden />
          Delete account…
        </FormButton>
      </AlertDialogTrigger>

      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden data-[size=default]:sm:max-w-[560px]">
        <AlertDialogTitle>Delete your account?</AlertDialogTitle>
        <AlertDialogDescription>
          Nothing is deleted today. You have 14 days to change your mind: sign
          in and press Keep my account, and everything comes back as it was. We
          sign you out everywhere and hide your profile now.
        </AlertDialogDescription>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto text-sm">
          <div>
            <b>When the 14 days end</b>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-mauve-300">
              <li>
                Your attendance stays in the club&apos;s totals without your
                name. Any credit tied to it is lost.
              </li>
              <li>
                Your reflections, survey answers, badges, project reports and
                saved meeting edits are erased.
              </li>
              <li>Your OAuth apps are deleted.</li>
              <li>
                DevDogs apps outside this site, like DogDays and DogPack, are
                told to delete your account. They do it on a best-effort basis.
              </li>
              <li>
                Copies held by Bevy, Engage and UGA stay there. Your Discord
                posts and GitHub contributions stay too.
              </li>
            </ul>
          </div>

          {(hasGithub || hasDiscord) && (
            <p className="m-0">
              Leaving the GitHub organization and the Discord server is yours to
              do; we can&apos;t remove you from accounts you manage.
              <LeaveLinks
                hasGithub={hasGithub}
                hasDiscord={hasDiscord}
                discordUrl={discordUrl}
              />
            </p>
          )}

          <p className="m-0">
            Want a copy first?{" "}
            <TextLink href="/account/data" download>
              <DownloadSimpleIcon aria-hidden className="inline" /> Download my
              data
            </TextLink>
          </p>

          <Field
            label={`Type "${DELETE_PHRASE}" to confirm`}
            htmlFor="delete-account-confirm"
          >
            <Input
              id="delete-account-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          </Field>

          <CommandFeedback result={result} />
        </div>

        <div className="flex items-center justify-end gap-4">
          <AlertDialogCancel disabled={pending}>
            Keep my account
          </AlertDialogCancel>
          <FormButton
            theme="rose"
            type="button"
            className="text-sm"
            disabled={!confirmed || pending}
            onClick={confirm}
          >
            {pending ? "Deleting…" : "Delete account"}
          </FormButton>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
