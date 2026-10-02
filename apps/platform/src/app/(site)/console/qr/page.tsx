import type { Metadata } from "next";
import PageShell from "~/components/PageShell";
import QrGenerator from "~/components/QrGenerator";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import Callout from "~/ui/callout";

export const metadata: Metadata = { title: "QR Codes | DevDogs" };

/**
 * Deprecated in favour of `backstage qr`, which takes the same options (both
 * parse `qrRequestSchema` from `@devdogsuga/brand/qr`) and needs no login.
 * Kept working for now, with new features going to the CLI only.
 */
export default async function QrPage() {
  await requirePermission(canUserManageAttendance);
  return (
    <PageShell
      accent="rose"
      title="QR Codes"
      description="Create branded, print-ready QR codes without installing the contributor CLI."
    >
      <Callout tone="warning" title="This page is deprecated">
        Use <code>pnpm dlx @devdogsuga/backstage qr</code> instead. It takes the
        same options and needs no sign-in. New QR features land there only.
      </Callout>
      <QrGenerator />
    </PageShell>
  );
}
