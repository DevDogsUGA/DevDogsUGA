"use client";

import "./imports.css";

import { useMemo, useState } from "react";
import {
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/ssr";
import { cn } from "~/lib/cn";
import {
  errorReportCsv,
  MAX_UPLOAD_BYTES,
  type ImportKind,
  type ImportMode,
  type ImportPreview,
  type ImportResponse,
  type ImportResult,
  type InvalidRow,
  type MappingField,
} from "~/lib/imports";
import { Panel } from "~/ui/app-shell";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Segmented } from "~/ui/segmented";
import { Table, TBody, Td, THead, Th, Tr } from "~/ui/table";

export interface MeetingChoice {
  id: string;
  label: string;
}

const MODE_COPY: Record<ImportKind, Record<ImportMode, [string, string]>> = {
  attendance: {
    add: [
      "Add only",
      "Records the people in the file. Nothing is ever removed.",
    ],
    replace: [
      "Replace earlier import",
      "Also removes check-ins an earlier import recorded that this file no longer lists. Check-ins members made themselves are never touched.",
    ],
  },
  roster: {
    add: [
      "Add only",
      "Verifies everyone on the roster. Nobody loses verification.",
    ],
    replace: [
      "Snapshot",
      "The roster is the whole truth: members who are not on it lose verification. Their accounts and identity stay.",
    ],
  },
};

const NEEDS_MAPPING = "needs-mapping";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function megabytes(bytes: number) {
  return `${bytes / 1_000_000} MB`;
}

export default function ImportsWorkspace({
  meetings,
  initialKind,
  initialMeetingId,
}: {
  meetings: MeetingChoice[];
  initialKind: ImportKind;
  initialMeetingId: string | null;
}) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [mode, setMode] = useState<ImportMode>("add");
  const [meetingId, setMeetingId] = useState(initialMeetingId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  // What the shown preview was made from. Anything the officer changes after
  // that makes the preview stale: it is replaced, never confirmed (Q18, Q78).
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);

  const fileKey = file ? `${file.name}:${file.size}:${file.lastModified}` : "";
  const currentKey = useMemo(
    () => JSON.stringify([kind, mode, meetingId, fileKey, mapping]),
    [kind, mode, meetingId, fileKey, mapping],
  );
  const preview = response?.kind === "preview" ? response.preview : null;
  const stale = preview !== null && previewedKey !== currentKey;

  function reset() {
    setResponse(null);
    setPreviewedKey(null);
    setSkipInvalid(false);
  }

  function changeKind(next: string) {
    setKind(next as ImportKind);
    setMode("add");
    setMapping({});
    reset();
  }

  function chooseFile(next: File | null) {
    setFileError(null);
    setMapping({});
    reset();
    if (next && next.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setFileError(
        `That file is over the ${megabytes(MAX_UPLOAD_BYTES)} limit. Export only the columns and rows you need.`,
      );
      return;
    }
    setFile(next);
  }

  async function send(
    step: "preview" | "confirm",
    withMapping: Record<string, string>,
  ) {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("mode", mode);
    if (kind === "attendance") body.set("meetingId", meetingId);
    body.set("mapping", JSON.stringify(withMapping));
    if (step === "confirm" && preview) {
      body.set("fingerprint", preview.fingerprint);
      body.set("skipInvalid", String(skipInvalid));
    }
    setBusy(true);
    try {
      const res = await fetch(`/console/data/imports/${step}`, {
        method: "POST",
        body,
      });
      const json = (await res
        .json()
        .catch(() => null)) as ImportResponse | null;
      const next: ImportResponse = json ?? {
        kind: "error",
        message: "The import failed on the server. Nothing was changed.",
      };
      setResponse(next);
      if (next.kind === "preview") {
        setMapping(
          Object.fromEntries(
            Object.entries(next.preview.mapping).map(([k, v]) => [k, v ?? ""]),
          ),
        );
        setPreviewedKey(
          JSON.stringify([
            kind,
            mode,
            meetingId,
            fileKey,
            Object.fromEntries(
              Object.entries(next.preview.mapping).map(([k, v]) => [
                k,
                v ?? "",
              ]),
            ),
          ]),
        );
        setSkipInvalid(false);
      }
    } catch {
      setResponse({
        kind: "error",
        message: "Could not reach the server. Nothing was changed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const canPreview =
    file !== null && (kind === "roster" || meetingId !== "") && !busy;
  const result = response?.kind === "result" ? response.result : null;
  const [modeLabel, modeHelp] = MODE_COPY[kind][mode];

  return (
    <div className="imp-stack">
      <Panel title="Choose a file" id="imp-choose">
        <div className="imp-stack">
          <Field label="What are you importing?">
            <Segmented
              aria-label="Import type"
              value={kind}
              onValueChange={changeKind}
              options={[
                { value: "attendance", label: "Attendance sheet" },
                { value: "roster", label: "Involvement roster" },
              ]}
            />
          </Field>

          {kind === "attendance" && (
            <Field label="Meeting" htmlFor="imp-meeting" required>
              <span className="input select">
                <select
                  id="imp-meeting"
                  value={meetingId}
                  onChange={(e) => {
                    setMeetingId(e.target.value);
                    reset();
                  }}
                >
                  <option value="">Choose a meeting…</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </span>
            </Field>
          )}

          <Field label="Mode" description={modeHelp}>
            <Segmented
              aria-label="Import mode"
              value={mode}
              onValueChange={(v) => {
                setMode(v as ImportMode);
                reset();
              }}
              options={[
                { value: "add", label: MODE_COPY[kind].add[0] },
                { value: "replace", label: MODE_COPY[kind].replace[0] },
              ]}
            />
          </Field>

          <Field
            label="CSV file"
            htmlFor="imp-file"
            required
            error={fileError}
            description={
              kind === "attendance"
                ? `A Google or Microsoft Forms export, or a sheet saved as CSV. Up to ${megabytes(MAX_UPLOAD_BYTES)}.`
                : `The Involvement Network roster: Roster, Export, Organization Roster. Up to ${megabytes(MAX_UPLOAD_BYTES)}.`
            }
          >
            <input
              id="imp-file"
              className="imp-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </Field>

          <div className="imp-actions">
            <Button
              type="button"
              disabled={!canPreview}
              onClick={() => send("preview", {})}
            >
              <UploadSimpleIcon aria-hidden /> Preview
            </Button>
            <span className="small muted">
              Uploading changes nothing. You confirm after the preview.
            </span>
          </div>
        </div>
      </Panel>

      {response?.kind === "error" && (
        <Callout tone="critical" alert title="Could not use that file">
          {response.message}
        </Callout>
      )}

      {response?.kind === NEEDS_MAPPING && (
        <Panel title="Tell us which columns are which" id="imp-map-first">
          <div className="imp-stack">
            <Callout
              tone="warning"
              title="That file's header was not recognized"
            >
              {response.message}
            </Callout>
            <MappingPicker
              fields={response.mappingFields}
              headers={response.headers}
              value={mapping}
              onChange={setMapping}
            />
            <div className="imp-actions">
              <Button
                type="button"
                disabled={busy}
                onClick={() => send("preview", mapping)}
              >
                Preview with these columns
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {preview && (
        <PreviewPanel
          preview={preview}
          notice={response?.kind === "preview" ? response.notice : undefined}
          mapping={mapping}
          onMapping={setMapping}
          stale={stale}
          busy={busy}
          skipInvalid={skipInvalid}
          onSkipInvalid={setSkipInvalid}
          onRefresh={() => send("preview", mapping)}
          onConfirm={() => send("confirm", mapping)}
        />
      )}

      {result && (
        <ResultPanel
          result={result}
          onAgain={() => {
            setFile(null);
            setMapping({});
            reset();
            const input = document.getElementById("imp-file");
            if (input instanceof HTMLInputElement) input.value = "";
          }}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {busy ? "Working" : modeLabel}
      </p>
    </div>
  );
}

function MappingPicker({
  fields,
  headers,
  value,
  onChange,
}: {
  fields: MappingField[];
  headers: string[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div className="imp-maps">
      {fields.map((f) => (
        <Field
          key={f.key}
          label={f.label}
          htmlFor={`imp-map-${f.key}`}
          required={f.required}
        >
          <span className="input select">
            <select
              id={`imp-map-${f.key}`}
              value={value[f.key] ?? ""}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            >
              <option value="">
                {f.required ? "Choose a column…" : "None"}
              </option>
              {headers.map((h, i) => (
                <option key={`${i}-${h}`} value={h}>
                  {h || `Column ${i + 1}`}
                </option>
              ))}
            </select>
          </span>
        </Field>
      ))}
    </div>
  );
}

function PreviewPanel({
  preview,
  notice,
  mapping,
  onMapping,
  stale,
  busy,
  skipInvalid,
  onSkipInvalid,
  onRefresh,
  onConfirm,
}: {
  preview: ImportPreview;
  notice?: string;
  mapping: Record<string, string>;
  onMapping: (next: Record<string, string>) => void;
  stale: boolean;
  busy: boolean;
  skipInvalid: boolean;
  onSkipInvalid: (next: boolean) => void;
  onRefresh: () => void;
  onConfirm: () => void;
}) {
  const invalidTotal = preview.invalid.length + preview.invalidMore;
  const needsAck = invalidTotal > 0;
  const canConfirm =
    !stale && !busy && !preview.blocked && (!needsAck || skipInvalid);
  const [, modeHelp] = MODE_COPY[preview.kind][preview.mode];

  return (
    <Panel title="Preview" id="imp-preview">
      <div className="imp-stack">
        {notice && (
          <Callout tone="warning" alert title="The preview was refreshed">
            {notice}
          </Callout>
        )}
        <p className="small muted imp-wrap">
          {preview.fileName}
          {preview.meeting
            ? ` into ${preview.meeting.title} (${preview.meeting.when})`
            : ""}
          . {modeHelp}
        </p>

        {preview.mappingFields.length > 0 && (
          <details>
            <summary>
              Columns read (
              {Object.values(preview.mapping).filter(Boolean).join(", ")})
            </summary>
            <div className="imp-stack">
              <MappingPicker
                fields={preview.mappingFields}
                headers={preview.headers}
                value={mapping}
                onChange={onMapping}
              />
            </div>
          </details>
        )}

        {stale && (
          <Callout tone="info" title="You changed something since this preview">
            Preview again to see what the new choices would do. Confirming is
            off until you do.
          </Callout>
        )}

        <ul className="imp-summary" aria-label="What this import does">
          {preview.summary.map((line) => (
            <li key={line.label}>
              <span className={cn(line.tone === "remove" && "imp-remove")}>
                {line.label}
              </span>
              <b>{line.count}</b>
            </li>
          ))}
        </ul>

        {preview.warnings.map((w) => (
          <Callout key={w} tone="warning">
            {w}
          </Callout>
        ))}

        {preview.samples.length > 0 && (
          <div className="imp-samples">
            {preview.samples.map((s) => (
              <details key={s.heading}>
                <summary>
                  {s.heading} ({s.items.length + s.more})
                </summary>
                <ul>
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {s.more > 0 && <li>and {s.more} more</li>}
                </ul>
              </details>
            ))}
          </div>
        )}

        {invalidTotal > 0 && (
          <div className="imp-stack">
            <Callout
              tone="warning"
              title={`${invalidTotal} ${invalidTotal === 1 ? "row" : "rows"} will be skipped`}
            >
              These rows cannot be imported. Download the report, correct the
              file and import it again to add them.
            </Callout>
            <InvalidTable rows={preview.invalid.slice(0, 50)} />
            {invalidTotal > 50 && (
              <p className="small muted">
                Showing the first 50. The report lists
                {preview.invalidMore > 0 ? " up to 1,000" : " all"}.
              </p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  download(
                    `${preview.kind}-import-errors.csv`,
                    errorReportCsv(preview.invalid),
                  )
                }
              >
                <DownloadSimpleIcon aria-hidden /> Download error report
              </Button>
            </div>
          </div>
        )}

        {preview.blocked && (
          <Callout tone="critical" title="This import cannot run">
            {preview.blocked}
          </Callout>
        )}

        {needsAck && !preview.blocked && (
          <Checkbox
            checked={skipInvalid}
            onChange={(e) => onSkipInvalid(e.target.checked)}
            label="I understand the invalid rows will be skipped."
          />
        )}

        <div className="imp-actions">
          {stale ? (
            <Button type="button" disabled={busy} onClick={onRefresh}>
              Preview again
            </Button>
          ) : (
            <Button type="button" disabled={!canConfirm} onClick={onConfirm}>
              Confirm and import
            </Button>
          )}
          {busy && <span className="small muted">Working…</span>}
        </div>
      </div>
    </Panel>
  );
}

function InvalidTable({ rows }: { rows: InvalidRow[] }) {
  return (
    <div className="imp-bad">
      <Table caption="Rows that will be skipped">
        <THead>
          <Tr>
            <Th num>Line</Th>
            <Th>Value</Th>
            <Th>Problem</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <Tr key={`${r.line}-${i}`}>
              <Td num>{r.line ?? ""}</Td>
              <Td className="imp-wrap">{r.value || "(empty)"}</Td>
              <Td>{r.reason}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function ResultPanel({
  result,
  onAgain,
}: {
  result: ImportResult;
  onAgain: () => void;
}) {
  const tone =
    result.status === "done"
      ? "success"
      : result.status === "stopped"
        ? "critical"
        : "warning";
  const hasReport = result.invalid.length > 0 || result.failures.length > 0;
  return (
    <Panel title="Result" id="imp-result">
      <div className="imp-stack">
        <Callout
          tone={tone}
          alert
          title={
            result.status === "done"
              ? "Import finished"
              : result.status === "stopped"
                ? "Import stopped"
                : "Import finished with problems"
          }
        >
          {result.message}
        </Callout>
        <ul className="imp-summary" aria-label="Counts">
          {result.counts.map((c) => (
            <li key={c.label}>
              <span>{c.label}</span>
              <b>{c.count}</b>
            </li>
          ))}
        </ul>
        {result.failures.length > 0 && (
          <Table caption="Accounts that could not be created">
            <THead>
              <Tr>
                <Th>Address</Th>
                <Th>Reason</Th>
              </Tr>
            </THead>
            <TBody>
              {result.failures.map((f) => (
                <Tr key={f.email}>
                  <Td className="imp-wrap">{f.email}</Td>
                  <Td>{f.reason}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <div className="imp-actions">
          {hasReport && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                download(
                  `${result.kind}-import-errors.csv`,
                  errorReportCsv(result.invalid, result.failures),
                )
              }
            >
              <DownloadSimpleIcon aria-hidden /> Download error report
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onAgain}>
            Import another file
          </Button>
        </div>
      </div>
    </Panel>
  );
}
