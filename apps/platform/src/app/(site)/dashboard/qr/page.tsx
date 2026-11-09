import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import PageShell from "~/classic/components/PageShell";
import QrGenerator from "~/classic/components/QrGenerator";
import Callout from "~/classic/ui/callout";

export const metadata: Metadata = {
  title: "QR codes | Console | DevDogs",
  robots: { index: false },
};

/**
 * Deprecated in favour of `backstage qr`, which takes the same options (both
 * parse `qrRequestSchema` from `@devdogsuga/sdk/brand/qr`) and needs no login.
 * Kept working for now, with new features going to the CLI only.
 */
export default async function QrPage() {
  await requireAccess(rules.manageAttendance);
  return (
    <ConsoleFrame>
      <PageShell
        accent="rose"
        title="QR Codes"
        description="Create branded, print-ready QR codes without installing the contributor CLI."
      >
        <Callout tone="warning" title="This page is deprecated">
          Use <code>pnpm backstage qr</code> from a Backstage clone instead. It
          takes the same options and needs no sign-in. New QR features land
          there only.
        </Callout>
        <QrGenerator />
      </PageShell>
    </ConsoleFrame>
  );
}
