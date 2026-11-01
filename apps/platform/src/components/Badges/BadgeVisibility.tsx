"use client";

import "./badges.css";

import { useState } from "react";
import { setMyBadgeHidden } from "~/server/actions/badges";
import Toggle from "~/ui/switch";
import { CommandFeedback, useCommand } from "~/ui/use-command";

export interface VisibilityItem {
  key: string;
  name: string;
  badgeId: string;
  workshopDefinitionId: string | null;
  hidden: boolean;
  count: number;
}

/**
 * One switch per badge in Settings: on shows it on the public profile. It
 * applies at once (a badge is a record, not a draft), keeps the earning
 * record either way, and hides the badge's citation with it.
 */
export default function BadgeVisibility({
  items,
}: {
  items: readonly VisibilityItem[];
}) {
  const [hidden, setHidden] = useState(
    () => new Map(items.map((item) => [item.key, item.hidden])),
  );
  // The switches keep their own state, so there is no page to refresh.
  const { run, pending, result } = useCommand(
    async (item: VisibilityItem, next: boolean) => {
      const outcome = await setMyBadgeHidden({
        badgeId: item.badgeId,
        workshopDefinitionId: item.workshopDefinitionId,
        hidden: next,
      });
      if (outcome.ok) {
        setHidden((current) => new Map(current).set(item.key, next));
      }
      return outcome;
    },
    { refresh: false },
  );

  if (items.length === 0) {
    return <p className="bdg-empty">You have no badges yet.</p>;
  }

  function flip(item: VisibilityItem) {
    run(item, !hidden.get(item.key));
  }

  return (
    <div>
      <ul className="bdg-list">
        {items.map((item) => {
          const shown = !hidden.get(item.key);
          return (
            <li key={item.key} className="bdg-item bdg-row">
              <span className="bdg-name">
                {item.name}
                {item.count > 1 && (
                  <span className="bdg-multiplier"> ×{item.count}</span>
                )}
              </span>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  flip(item);
                }}
              >
                <Toggle
                  checked={shown}
                  pending={pending}
                  aria-label={`Show ${item.name} on my public profile`}
                />
              </form>
            </li>
          );
        })}
      </ul>
      <CommandFeedback result={result} />
    </div>
  );
}
