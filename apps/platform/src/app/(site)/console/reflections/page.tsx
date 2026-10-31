import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import ConsoleShell from "~/components/Console/ConsoleShell";
import ReflectionSettingsCard from "~/components/ReflectionSettingsCard";

import { getReflectionSettings } from "~/server/reflections/settings";
import { PageHeading } from "~/ui/app-shell";

export const metadata: Metadata = {
  title: "Reflections | Console | DevDogs",
  robots: { index: false },
};

export default async function ReflectionsPage() {
  await requireAccess(rules.manageAttendance);
  const settings = await getReflectionSettings();

  return (
    <ConsoleShell current="/console/reflections">
      <PageHeading
        title="Reflections"
        description="Rules for every Experiential Learning (EL) reflection, club-wide. Members see them on their attendance page."
      />
      <ReflectionSettingsCard settings={settings} />
    </ConsoleShell>
  );
}
