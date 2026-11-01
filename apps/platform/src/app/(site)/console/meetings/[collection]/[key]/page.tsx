import { rules, requireAccess } from "~/server/auth/access";
import { getAuthoredFiles } from "@devdogsuga/events";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChangeList from "~/components/ConfigEditor/ChangeList";
import ConfigItemForm from "~/components/ConfigEditor/ConfigItemForm";
import "~/components/Console/console.css";
import AppSideNav from "~/components/AppSideNav";
import { AppShell } from "~/ui/app-shell";

import {
  COLLECTION_LABELS,
  FIELDS,
  isCollection,
  toFormText,
} from "~/server/config/editFields";
import {
  applyFields,
  diffItem,
  findItem,
  type AuthoredConfig,
} from "~/server/config/edits";
import { listEdits } from "~/server/config/editsStore";
import { PageHeading, Panel } from "~/ui/app-shell";
import Callout from "~/ui/callout";

export const metadata: Metadata = {
  title: "Edit | Schedule editor | Console | DevDogs",
  robots: { index: false },
};

/**
 * One meeting, workshop or venue (`new` for a new one). The form starts from
 * the official item with this officer's saved edit over it, so what they see is
 * their own view; saving stores only the fields that differ from official.
 */
export default async function ScheduleItemPage({
  params,
}: {
  params: Promise<{ collection: string; key: string }>;
}) {
  const userId = (await requireAccess(rules.officer)).userId;
  const { collection, key } = await params;
  if (!isCollection(collection)) notFound();
  const isNew = key === "new";

  const official = getAuthoredFiles() as unknown as AuthoredConfig;
  const saved = (await listEdits(userId)).find(
    (edit) => edit.collection === collection && edit.key === key,
  );
  const base = isNew ? undefined : findItem(official, collection, key);
  // A saved new item stays editable at its own key.
  const savedNew = saved?.isNew ? saved : undefined;
  if (!isNew && !base && !savedNew) notFound();

  const current = savedNew
    ? { [COLLECTION_LABELS[collection].key]: key, ...savedNew.fields }
    : base
      ? saved
        ? applyFields(collection, base, saved.fields)
        : base
      : undefined;

  const fields = FIELDS[collection];
  const values = Object.fromEntries(
    fields.map((field) => [field.name, toFormText(field, current)]),
  );
  const series = (official.series as { series: { id: string; name: string }[] })
    .series;
  const venues = official.venues.venues;
  const choices = {
    series: series.map((s) => ({ value: s.id, label: s.name })),
    venue: venues.map((v) => ({ value: String(v.id), label: String(v.name) })),
  };

  const label = COLLECTION_LABELS[collection];
  const change =
    base && current ? diffItem(collection, key, base, current) : undefined;

  return (
    <AppShell side={<AppSideNav />} className="con">
      <PageHeading
        crumbs={[
          { label: "Schedule editor", href: "/console/meetings" },
          { label: isNew ? `New ${label.singular}` : key },
        ]}
        title={isNew ? `New ${label.singular}` : `Edit ${label.singular}`}
        description={`Saved privately with only the fields you change. Nothing is proposed until you open a pull request from the schedule editor. Writes to ${label.file}.`}
      />
      {savedNew && (
        <Callout tone="info" title="New, not yet proposed">
          This {label.singular} exists only in your saved edits.
        </Callout>
      )}
      <Panel id="edit" title={isNew ? "Details" : key}>
        <ConfigItemForm
          collection={collection}
          itemKey={key}
          isNew={isNew || Boolean(savedNew)}
          keyLocked={!isNew}
          fields={fields}
          values={values}
          choices={choices}
          hasEdit={Boolean(saved)}
        />
      </Panel>
      {change && (
        <Panel id="diff" title="Differences from official">
          <ChangeList changes={[change]} />
        </Panel>
      )}
    </AppShell>
  );
}
