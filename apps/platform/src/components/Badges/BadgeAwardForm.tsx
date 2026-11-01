"use client";

import "./badges.css";

import { useCommand, CommandFeedback } from "~/ui/use-command";
import { awardBadge, withdrawBadgeAward } from "~/server/actions/badges";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

export interface AwardableBadge {
  id: string;
  name: string;
}

/** An officer awards one of the manual badges, with its public citation. */
export function BadgeAwardForm({
  userId,
  badges,
}: {
  userId: string;
  badges: readonly AwardableBadge[];
}) {
  const { result, run: action, pending } = useCommand(awardBadge);
  return (
    <form action={action} className="bdg-form">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Badge" htmlFor="bdg-badge">
        <span className="input select">
          <select id="bdg-badge" name="badgeId" required defaultValue="">
            <option value="" disabled>
              Choose a badge
            </option>
            {badges.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.name}
              </option>
            ))}
          </select>
        </span>
      </Field>
      <Field
        label="Citation"
        htmlFor="bdg-citation"
        description="One or two sentences on what they did. It is shown publicly beside the badge, and hidden if they hide the badge."
        required
      >
        <Textarea
          id="bdg-citation"
          name="citation"
          required
          maxLength={280}
          rows={3}
        />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Award badge
        </Button>
      </div>
      <CommandFeedback result={result} />
    </form>
  );
}

/** An officer withdraws one award, saying why. The record stays. */
export function BadgeWithdrawForm({ awardId }: { awardId: string }) {
  const { result, run: action, pending } = useCommand(withdrawBadgeAward);
  return (
    <form action={action} className="bdg-inline">
      <input type="hidden" name="awardId" value={awardId} />
      <Field label="Reason for withdrawing" htmlFor={`bdg-reason-${awardId}`}>
        <Input
          id={`bdg-reason-${awardId}`}
          name="reason"
          required
          maxLength={280}
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Withdraw
      </Button>
      <CommandFeedback result={result} />
    </form>
  );
}
