import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import PageHeader from "~/components/PageHeader";
import { CardSkeleton } from "~/components/Skeletons";
import VerificationImportForm from "~/components/VerificationImportForm";
import { getVerificationPageData } from "~/server/loaders/verification";

async function VerificationData() {
  await getVerificationPageData();

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
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="emerald" />

      <PageHeader
        title="Verification"
        description="Upload the UGA Involvement Network roster to verify member profiles and unlock community page visibility."
        accent="emerald"
      />

      <Suspense fallback={<CardSkeleton rows={1} />}>
        <VerificationData />
      </Suspense>
    </div>
  );
}
