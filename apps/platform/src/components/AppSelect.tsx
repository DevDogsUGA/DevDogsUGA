"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import type { AppOption } from "~/server/loaders/moderationConfig";

/**
 * Picks which registered app the page is configuring, through the URL.
 *
 * The selection lives in a search param rather than component state so the
 * page stays server-rendered: switching apps refetches that app's rows through
 * the loader instead of shipping every app's configuration to the browser and
 * filtering it there.
 */
export default function AppSelect({
  apps,
  selectedSlug,
}: {
  apps: AppOption[];
  selectedSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(slug: string) {
    const params = new URLSearchParams(searchParams);
    params.set("app", slug);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={selectedSlug} onValueChange={handleChange}>
      <SelectTrigger className="max-w-sm">
        <SelectValue placeholder="Select an app" />
      </SelectTrigger>
      <SelectContent>
        {apps.map((app) => (
          <SelectItem key={app.id} value={app.slug}>
            {app.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
