"use client";

import { useEffect } from "react";
import { useTargetQuery } from "./panels";

export interface TargetApp {
  id: string;
  slug: string;
  displayName: string;
}

/**
 * Picks an app from the *targeted* instance's registry.
 *
 * Not from this site's own — a contributor's stack may have apps registered
 * that production has never heard of, which is precisely the case the forum is
 * in until it migrates.
 */
export default function TargetedAppSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string) => void;
}) {
  const { data: apps, error } = useTargetQuery<TargetApp[]>(async (client) => {
    const { data, error: err } = await client
      .from("apps")
      .select("id, slug, displayName")
      .order("displayName");
    if (err) throw new Error(err.message);
    return (data ?? []) as TargetApp[];
  }, []);

  // Select the first app as soon as one is known, so every panel below has
  // something to show without a click.
  useEffect(() => {
    if (!value && apps && apps.length > 0) onChange(apps[0]!.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);

  if (error) return <p className="text-xs text-rose-400">{error}</p>;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-sm rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white"
    >
      {(apps ?? []).map((app) => (
        <option key={app.id} value={app.slug}>
          {app.displayName}
        </option>
      ))}
    </select>
  );
}
