import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DownloadSimpleIcon } from "~/config/icons";
import PageShell from "~/components/PageShell";
import { canUserExportStars } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";

export const metadata: Metadata = {
  title: "Exports | DevDogs",
  robots: { index: false },
};

interface ExportLink {
  href: string;
  label: string;
  description: string;
}

const EXPORTS: ExportLink[] = [
  {
    href: "/export/stars",
    label: "Stars",
    description:
      "One row per earned meeting or competition star, across every semester.",
  },
  {
    href: "/export/attendance",
    label: "Attendance",
    description: "One row per check-in: who scanned in, when, and how.",
  },
  {
    href: "/export/reflections",
    label: "Reflections",
    description: "One row per reflection, carrying the member's current text.",
  },
];

/**
 * Every CSV export in one place, gated on `canExportStars` -- the one flag
 * that covers all three, since an officer trusted with one export's PII is
 * trusted with the others. `/export/stars` predates this page and was reached
 * by URL alone; the other two ship alongside it so none of the three is a
 * link nobody without repo access can find.
 */
export default async function ExportsPage() {
  await requirePermission(canUserExportStars);

  return (
    <PageShell
      accent="cyan"
      title="Exports"
      description="Download a CSV snapshot. Every download is recorded in the audit log, including who ran it and with what filters."
    >
      <div className="overflow-hidden rounded-xl border-2 border-mauve-800 bg-mauve-950 shadow-lg shadow-black/30">
        <ul className="divide-y divide-mauve-800">
          {EXPORTS.map((item) => (
            <ExportRow key={item.href} {...item} />
          ))}
        </ul>
      </div>
    </PageShell>
  );
}

function ExportRow({ href, label, description }: ExportLink): ReactNode {
  return (
    <li>
      <a
        href={href}
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
      >
        <span>
          <span className="font-semibold text-white">{label}</span>
          <span className="mt-1 block text-sm text-mauve-400">
            {description}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          <DownloadSimpleIcon size={16} />
          Download
        </span>
      </a>
    </li>
  );
}
