"use client";

import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { useState, useTransition } from "react";
import { requestAccountDeletion } from "~/server/actions/accountDeletion";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/ui/alert-dialog";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { confirmationMatches, DELETE_PHRASE } from "./confirm";
import LeaveLinks from "./LeaveLinks";

import "./account-deletion.css";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmed = confirmationMatches(typed, DELETE_PHRASE);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    setTyped("");
    setError(null);
  }

  function confirm() {
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestAccountDeletion(userId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // The request signed the member out of every session; the pending
        // page is where they land.
        navigate("/account/deletion");
      } catch {
        setError("Something went wrong. Nothing was changed. Try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <TrashIcon aria-hidden />
          Delete account…
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[560px]">
        <AlertDialogTitle>Delete your account?</AlertDialogTitle>
        <AlertDialogDescription>
          Nothing is deleted today. You have 14 days to change your mind: sign
          in and press Keep my account, and everything comes back as it was. We
          sign you out everywhere and hide your profile now.
        </AlertDialogDescription>

        <div className="acctdel-dialog-body">
          <div>
            <b>When the 14 days end</b>
            <ul className="acctdel-list">
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
            <a className="textlink" href="/account/data" download>
              <DownloadSimpleIcon aria-hidden /> Download my data
            </a>
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

          {error && (
            <Callout tone="critical" alert className="acctdel-error">
              {error}
            </Callout>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Keep my account
          </AlertDialogCancel>
          <Button
            type="button"
            variant="danger-solid"
            size="sm"
            disabled={!confirmed}
            loading={pending}
            onClick={confirm}
          >
            Delete account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
