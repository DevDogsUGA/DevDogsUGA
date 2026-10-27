"use client";

import "./badges.css";

import { useState, useTransition } from "react";
import { setMyBadgeHidden } from "~/server/actions/badges";
import Toggle from "~/ui/switch";

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
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  if (items.length === 0) {
    return <p className="bdg-empty">You have no badges yet.</p>;
  }

  function flip(item: VisibilityItem) {
    const next = !hidden.get(item.key);
    startTransition(async () => {
      setFailed(false);
      try {
        await setMyBadgeHidden({
          badgeId: item.badgeId,
          workshopDefinitionId: item.workshopDefinitionId,
          hidden: next,
        });
        setHidden((current) => new Map(current).set(item.key, next));
      } catch {
        setFailed(true);
      }
    });
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
      {failed && (
        <p className="bdg-status" role="alert">
          That change did not save. Try again.
        </p>
      )}
    </div>
  );
}
