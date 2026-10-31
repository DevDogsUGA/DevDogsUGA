import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import "~/components/Console/console.css";
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
    <div className="con">
      <PageHeading
        title="Reflections"
        description="Rules for every Experiential Learning (EL) reflection, club-wide. Members see them on their attendance page."
      />
      <ReflectionSettingsCard settings={settings} />
    </div>
  );
}
