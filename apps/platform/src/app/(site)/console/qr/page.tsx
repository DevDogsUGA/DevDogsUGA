import type { Metadata } from "next";
import PageShell from "~/components/PageShell";
import QrGenerator from "~/components/QrGenerator";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";

export const metadata: Metadata = { title: "QR Codes | DevDogs" };

export default async function QrPage() {
  await requirePermission(canUserManageAttendance);
  return (
    <PageShell
      accent="rose"
      title="QR Codes"
      description="Create branded, print-ready QR codes without installing the contributor CLI."
    >
      <QrGenerator />
    </PageShell>
  );
}
