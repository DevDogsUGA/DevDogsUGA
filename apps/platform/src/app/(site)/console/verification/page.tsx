import { Suspense } from "react";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import PageShell from "~/components/PageShell";
import { CardSkeleton } from "~/components/Skeletons";
import VerificationImportForm from "~/components/VerificationImportForm";
import { requireVerificationAccess } from "~/server/loaders/verification";

async function VerificationData() {
  await requireVerificationAccess();

  return (
    <ConsoleCard.Root id="import-involvement">
      <ConsoleCard.Header title="Import Involvement" />
      <ConsoleCard.Content>
        <Field
          id="roster-csv"
          label="Roster CSV"
          description="Export the membership roster from the UGA Involvement Network and upload it here. Members whose name and email match a profile are marked verified."
        >
          <VerificationImportForm />
        </Field>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}

export default function VerificationPage() {
  return (
    <PageShell
      accent="emerald"
      title="Verification"
      description="Upload the UGA Involvement Network roster to verify member profiles and unlock community page visibility."
    >
      <Suspense fallback={<CardSkeleton rows={1} />}>
        <VerificationData />
      </Suspense>
    </PageShell>
  );
}
