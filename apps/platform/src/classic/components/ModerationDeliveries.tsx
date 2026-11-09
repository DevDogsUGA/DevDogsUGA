"use client";

import Link from "next/link";
import { resendDelivery } from "~/server/actions/moderationDeliveries";
import ConfirmDestructiveAction from "~/classic/ui/confirm-destructive-action";
import FormButton from "~/classic/components/FormButton";
import Badge from "~/classic/ui/badge";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

export interface DeliveryListEntry {
  id: string;
  type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  appName?: string | null;
  reportId?: string | null;
}

const STATUS_VARIANT = {
  delivered: "success",
  pending: "warning",
  failed: "danger",
} as const;

const STATUS_HELP = {
  delivered: "The app has it.",
  pending: "Still being retried.",
  failed: "Retries are used up. Fix the app's endpoint, then resend.",
} as const;

/**
 * Signed decisions owed to apps outside this database, and how each is going.
 *
 * `failed` means the queue gave up (the dead-letter queue marked it and raised
 * an alert); resend puts it back as pending and queues it again. The receiver
 * ignores a message id it has already applied, so a resend can never apply a
 * decision twice.
 */
export default function ModerationDeliveries({
  deliveries,
  linkReports = false,
}: {
  deliveries: DeliveryListEntry[];
  /** On the dashboard each row names its report; on the report it would be circular. */
  linkReports?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {deliveries.map((delivery) => (
        <li
          key={delivery.id}
          className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-white/80">
                {delivery.type}
              </span>
              <Badge variant={STATUS_VARIANT[delivery.status]}>
                {delivery.status}
              </Badge>
              {delivery.appName && (
                <span className="text-xs text-mauve-400">
                  {delivery.appName}
                </span>
              )}
              {linkReports && delivery.reportId && (
                <Link
                  href={`/dashboard/moderation/${delivery.reportId}`}
                  className="text-xs text-mauve-400 hover:text-white"
                >
                  Report &rarr;
                </Link>
              )}
            </div>
            <p className="text-xs text-mauve-400">
              {STATUS_HELP[delivery.status]} {delivery.attempts} attempt
              {delivery.attempts === 1 ? "" : "s"}.
            </p>
            {delivery.lastError && delivery.status !== "delivered" && (
              <p className="truncate font-mono text-xs text-rose-300">
                {delivery.lastError}
              </p>
            )}
          </div>
          {delivery.status !== "delivered" && (
            <ResendDelivery delivery={delivery} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Each delivery owns its resend Command; the confirm dialog is composed around it. */
function ResendDelivery({ delivery }: { delivery: DeliveryListEntry }) {
  const { run, pending, result } = useCommand(resendDelivery);
  return (
    <div className="flex flex-col items-end gap-2">
      <ConfirmDestructiveAction
        title={`Resend ${delivery.type}${delivery.appName ? ` to ${delivery.appName}` : ""}?`}
        description={`It goes back to pending and is queued again.${delivery.appName ? ` ${delivery.appName} ignores` : " The app ignores"} a decision it has already applied.`}
        action={() => run(delivery.id)}
        submitLabel="Resend"
      >
        <FormButton
          theme="black"
          type="submit"
          className="text-sm"
          disabled={pending}
        >
          Resend
        </FormButton>
      </ConfirmDestructiveAction>
      <CommandFeedback result={result} />
    </div>
  );
}
