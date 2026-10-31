"use client";

import Link from "next/link";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ssr";
import { resendDelivery } from "~/server/actions/moderationDeliveries";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import Badge from "~/ui/badge";
import { CommandFeedback, useCommand } from "~/ui/use-command";

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
    <ul className="con-deliveries">
      {deliveries.map((delivery) => (
        <li key={delivery.id}>
          <div>
            <div className="con-meta">
              <code className="con-code">{delivery.type}</code>
              <Badge variant={STATUS_VARIANT[delivery.status]}>
                {delivery.status}
              </Badge>
              {delivery.appName && <span>{delivery.appName}</span>}
              <span>
                {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}
              </span>
            </div>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              {delivery.lastError && delivery.status !== "delivered" ? (
                <>{delivery.lastError}. </>
              ) : (
                <>{STATUS_HELP[delivery.status]} </>
              )}
              {linkReports && delivery.reportId && (
                <Link
                  href={`/dashboard/moderation/${delivery.reportId}`}
                  className="textlink"
                >
                  Open report
                </Link>
              )}
            </p>
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
    <>
      <ConfirmDestructiveAction
        title={`Resend ${delivery.type}${delivery.appName ? ` to ${delivery.appName}` : ""}?`}
        description={`It goes back to pending and is queued again.${delivery.appName ? ` ${delivery.appName} ignores` : " The app ignores"} a decision it has already applied.`}
        action={() => run(delivery.id)}
        submitLabel="Resend"
      >
        <FormButton theme="black" type="submit" size="sm" disabled={pending}>
          <ArrowsClockwiseIcon weight="bold" aria-hidden />
          Resend
        </FormButton>
      </ConfirmDestructiveAction>
      <CommandFeedback result={result} />
    </>
  );
}
