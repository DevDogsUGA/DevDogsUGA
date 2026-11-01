import { getClubConfig, getVenues, getWorkshops } from "@devdogsuga/events";
import type { Metadata } from "next";
import Link from "next/link";
import ChangeList from "~/components/ConfigEditor/ChangeList";
import OrphanReset from "~/components/ConfigEditor/OrphanReset";
import ProposalActions from "~/components/ConfigEditor/ProposalActions";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { formatEventDateTime } from "~/lib/eventTime";
import { isOfficer } from "~/server/auth/permissions";
import { requirePermission } from "~/server/auth/require";
import type { Collection } from "~/server/config/editFields";
import {
  configPrsAvailable,
  isStagingPr,
  previewProposal,
} from "~/server/config/proposals";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { EmptyState } from "~/ui/empty-state";

export const metadata: Metadata = {
  title: "Schedule editor | Console | DevDogs",
  robots: { index: false },
};

function label(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

interface Row {
  key: string;
  title: string;
  meta: string;
}

function List({
  collection,
  rows,
  edited,
  empty,
}: {
  collection: Collection;
  rows: Row[];
  edited: ReadonlySet<string>;
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="cfg-list">
      {rows.map((row) => (
        <li key={row.key} className="cfg-row">
          <Link
            href={`/console/meetings/${collection}/${row.key}`}
            className="cfg-row-title"
          >
            {row.title}
          </Link>
          {edited.has(`${collection}:${row.key}`) && (
            <Badge variant="info">Edited</Badge>
          )}
          <span className="cfg-row-meta">{row.meta}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The schedule editor. An officer edits meetings, and the workshops and venues
 * they name, privately; the diff against the official config sits here, and
 * Open PR turns it into a pull request opened by the config-PR GitHub App.
 * Officers need no repository access, and the merged config stays authoritative.
 */
export default async function ScheduleEditorPage() {
  const userId = await requirePermission(isOfficer);
  const preview = await previewProposal(userId);
  const edited = new Set(
    preview.edits.map((edit) => `${edit.collection}:${edit.key}`),
  );
  const available = configPrsAvailable();
  const valid = preview.validation.ok;
  const hasChanges = preview.changes.length > 0;

  const meetings = [...getClubConfig().meetings]
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map((m) => ({
      key: m.slug,
      title: m.title,
      meta: `${formatEventDateTime(m.startsAt)}${m.cancelledAt ? " · cancelled" : ""}`,
    }));
  const workshops = getWorkshops().workshops.map((w) => ({
    key: w.id,
    title: w.title,
    meta: `${w.elHours} EL ${w.elHours === 1 ? "hour" : "hours"}`,
  }));
  const venues = getVenues().venues.map((v) => ({
    key: v.id,
    title: v.name,
    meta: v.kind,
  }));
  const created = (collection: Collection, official: Row[]): Row[] =>
    preview.edits
      .filter(
        (e) =>
          e.isNew &&
          e.collection === collection &&
          !official.some((row) => row.key === e.key),
      )
      .map((e) => ({
        key: e.key,
        title: label(e.fields.title) ?? label(e.fields.name) ?? e.key,
        meta: "New, not yet proposed",
      }));

  return (
    <ConsoleShell current="/console/meetings">
      <PageHeading
        title="Schedule editor"
        description="Propose changes to meetings, and to the workshops and venues they use. Your edits are saved privately, with only the fields you changed. Open PR sends them to GitHub for review; the merged config is the official one."
      />
      {!available && (
        <Callout tone="warning" title="Pull requests are not set up here">
          You can still edit and see the diff, but Open PR is off until the
          config-PR GitHub App is configured for this environment.
        </Callout>
      )}
      {available && isStagingPr() && (
        <Callout tone="info" title="Staging">
          Pull requests opened from here are drafts labelled{" "}
          <code>staging</code>.
        </Callout>
      )}
      <Panel
        id="proposal"
        title="Your proposal"
        help="The difference between the official config and your saved edits. Any officer can open a pull request; review, changes and merging happen on GitHub."
      >
        {!hasChanges ? (
          <EmptyState title="No changes from the official config" />
        ) : (
          <div className="cfg-stack">
            <ChangeList changes={preview.changes} />
            {!preview.validation.ok && (
              <Callout
                tone="critical"
                title="This does not pass the config checks"
              >
                No pull request can be opened until these are fixed.
                <ul className="cfg-errors">
                  {preview.validation.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        )}
        {preview.orphans.length > 0 && (
          <Callout tone="warning" title="Some saved edits no longer apply">
            These edits no longer fit the official config, because the item was
            removed or added there since you saved them. They are left out of
            your pull request; reset each one.
            <ul className="cfg-errors">
              {preview.orphans.map((o) => (
                <li key={`${o.edit.collection}:${o.edit.key}`}>
                  {o.edit.collection} {o.edit.key}{" "}
                  <OrphanReset
                    collection={o.edit.collection}
                    editKey={o.edit.key}
                  />
                </li>
              ))}
            </ul>
          </Callout>
        )}
        <ProposalActions
          canOpen={available && valid && hasChanges}
          hasEdits={preview.edits.length > 0 || preview.orphans.length > 0}
        />
      </Panel>
      <Panel
        id="meetings"
        title="Meetings"
        help="Edit when and where a meeting is, its agenda or whether it is cancelled."
      >
        <p>
          <Link href="/console/meetings/meeting/new">New meeting</Link>
        </p>
        <List
          collection="meeting"
          rows={[...created("meeting", meetings), ...meetings]}
          edited={edited}
          empty="No meetings"
        />
      </Panel>
      <Panel
        id="workshops"
        title="Workshops"
        help="A workshop's title, description and EL hours are shared by every night it runs."
      >
        <p>
          <Link href="/console/meetings/workshop/new">New workshop</Link>
        </p>
        <List
          collection="workshop"
          rows={[...created("workshop", workshops), ...workshops]}
          edited={edited}
          empty="No workshops"
        />
      </Panel>
      <Panel
        id="venues"
        title="Venues"
        help="Where the club meets, referenced by meetings and series."
      >
        <p>
          <Link href="/console/meetings/venue/new">New venue</Link>
        </p>
        <List
          collection="venue"
          rows={[...created("venue", venues), ...venues]}
          edited={edited}
          empty="No venues"
        />
      </Panel>
    </ConsoleShell>
  );
}
