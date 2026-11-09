"use client";

import { useState, type ComponentProps } from "react";
import { DownloadSimpleIcon } from "@phosphor-icons/react/ssr";
import {
  CONSOLE_EXPORT_KINDS,
  type ConsoleExportKind,
  type ExportRequest,
  type ExportResponse,
} from "~/lib/exports";
import {
  Check,
  CONTROL,
  LabeledField as Field,
  Radios,
  SECONDARY,
  Section as Panel,
  Table,
  TBody,
  Td,
  THead,
  Th,
  Tr,
} from "~/classic/components/Console/parts";
import FormButton from "~/classic/components/FormButton";
import Callout from "~/classic/ui/callout";

function Primary(props: ComponentProps<"button">) {
  return <FormButton theme="cyan" className="text-sm" {...props} />;
}

function Secondary(props: ComponentProps<"button">) {
  return <button className={SECONDARY} {...props} />;
}

const STACK = "flex flex-col gap-5";
const ACTIONS = "flex flex-wrap items-center gap-3";
const NOTE = "text-xs text-mauve-400";

export interface MeetingChoice {
  id: string;
  label: string;
}

export interface FormatOption {
  name: string;
  label: string;
  hint: string;
  /** One meeting's attendance: needs a meeting chosen. */
  perEvent: boolean;
}

export type FormatOptions = Record<ConsoleExportKind, FormatOption[]>;

const KIND_LABEL: Record<ConsoleExportKind, string> = {
  attendance: "Attendance",
  reflections: "Reflections",
  responses: "Survey answers",
};

const KIND_HELP: Record<ConsoleExportKind, string> = {
  attendance:
    "One row per check-in, or the lists Bevy and the Involvement Network take.",
  reflections: "One row per reflection, with the member's current text.",
  responses:
    "One row per answer to the check-in survey, or one row per person.",
};

function save(name: string, mime: string, data: BlobPart) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const plural = (n: number, [one, many]: [string, string]) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function ExportsWorkspace({
  meetings,
  formats,
}: {
  meetings: MeetingChoice[];
  formats: FormatOptions;
}) {
  const [kind, setKind] = useState<ConsoleExportKind>("attendance");
  const [chosen, setChosen] = useState<string[]>(["platform"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [zip, setZip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<ExportResponse | null>(null);

  const options = formats[kind];
  const needsMeeting = options.some(
    (o) => o.perEvent && chosen.includes(o.name),
  );
  const takesMeeting = kind !== "reflections";
  const canSubmit =
    chosen.length > 0 && (!needsMeeting || meetingId !== "") && !busy;

  function changeKind(next: string) {
    setKind(next as ConsoleExportKind);
    setChosen(["platform"]);
    setMeetingId("");
    setZip(false);
    setResponse(null);
  }

  function toggle(name: string, on: boolean) {
    setChosen((cur) => (on ? [...cur, name] : cur.filter((n) => n !== name)));
    setResponse(null);
  }

  async function prepare() {
    const body: ExportRequest = {
      kind,
      formats: chosen,
      from: from || null,
      to: to || null,
      meetingId: takesMeeting && meetingId ? meetingId : null,
      zip: zip && chosen.length > 1,
    };
    setBusy(true);
    setResponse(null);
    try {
      const res = await fetch("/dashboard/data/exports/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res
        .json()
        .catch(() => null)) as ExportResponse | null;
      setResponse(
        json ?? {
          kind: "error",
          message: "The export failed on the server. Nothing was downloaded.",
        },
      );
    } catch {
      setResponse({
        kind: "error",
        message: "Could not reach the server. Nothing was downloaded.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={STACK}>
      <Panel title="Choose an export" id="exp-choose">
        <div className={STACK}>
          <Field label="Dataset" description={KIND_HELP[kind]}>
            <Radios
              ariaLabel="Dataset"
              name="exp-kind"
              value={kind}
              onValueChange={changeKind}
              options={CONSOLE_EXPORT_KINDS.map((k) => ({
                value: k,
                label: KIND_LABEL[k],
              }))}
            />
          </Field>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-xs font-medium text-white/70">
              Formats
            </legend>
            {options.map((o) => (
              <div key={o.name}>
                <Check
                  checked={chosen.includes(o.name)}
                  onChange={(e) => toggle(o.name, e.target.checked)}
                  label={o.label}
                />
                <p className="mt-0.5 ml-6 text-xs text-mauve-400">
                  {o.hint}
                  {o.perEvent ? " Needs one meeting." : ""}
                </p>
              </div>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {takesMeeting && (
              <Field
                label="Meeting"
                htmlFor="exp-meeting"
                required={needsMeeting}
              >
                <span className="flex">
                  <select
                    id="exp-meeting"
                    className={CONTROL}
                    value={meetingId}
                    onChange={(e) => {
                      setMeetingId(e.target.value);
                      setResponse(null);
                    }}
                  >
                    <option value="">
                      {needsMeeting ? "Choose a meeting…" : "All meetings"}
                    </option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </span>
              </Field>
            )}
            <Field label="From (optional)" htmlFor="exp-from">
              <input
                id="exp-from"
                className={CONTROL}
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setResponse(null);
                }}
              />
            </Field>
            <Field label="To, inclusive (optional)" htmlFor="exp-to">
              <input
                id="exp-to"
                className={CONTROL}
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setResponse(null);
                }}
              />
            </Field>
          </div>

          {chosen.length > 1 && (
            <Check
              checked={zip}
              onChange={(e) => {
                setZip(e.target.checked);
                setResponse(null);
              }}
              label="Bundle the files into one ZIP"
            />
          )}

          <div className={ACTIONS}>
            <Primary type="button" disabled={!canSubmit} onClick={prepare}>
              <DownloadSimpleIcon aria-hidden /> Prepare export
            </Primary>
            <span className={NOTE}>
              Preparing an export is recorded in the audit log under your name,
              before any data is read.
            </span>
          </div>
        </div>
      </Panel>

      {response?.kind === "error" && (
        <Callout tone="critical" alert title="Could not export">
          {response.message}
        </Callout>
      )}

      {response?.kind === "ready" && <ReadyPanel response={response} />}
      <p className="sr-only" aria-live="polite">
        {busy ? "Preparing the export" : ""}
      </p>
    </div>
  );
}

function ReadyPanel({
  response,
}: {
  response: Extract<ExportResponse, { kind: "ready" }>;
}) {
  const { files, zip, report, leftOut, leftOutTotal } = response;
  return (
    <Panel title="Ready to download" id="exp-ready">
      <div className={STACK}>
        <ul
          className="max-w-xl divide-y divide-mauve-800 text-sm text-mauve-200"
          aria-label="Counts"
        >
          {files.map((f) => (
            <li key={f.name} className="flex justify-between gap-4 py-2">
              <span className="[overflow-wrap:anywhere]">
                {f.label} ({f.name})
              </span>
              <b className="text-white tabular-nums">
                {plural(f.count, f.unit)}
              </b>
            </li>
          ))}
        </ul>

        {leftOutTotal > 0 ? (
          <Callout
            tone="warning"
            title={`${plural(leftOutTotal, ["entry", "entries"])} left out`}
          >
            Some people could not be written to a file. They are listed below
            with the reason, and in the report.
          </Callout>
        ) : (
          <p className={NOTE}>Nobody was left out.</p>
        )}

        {leftOut.length > 0 && (
          <div className="max-h-80 overflow-auto">
            <Table caption="Left out of the files">
              <THead>
                <Tr>
                  <Th>File</Th>
                  <Th>Person</Th>
                  <Th>What happened</Th>
                  <Th>Reason</Th>
                </Tr>
              </THead>
              <TBody>
                {leftOut.map((l, i) => (
                  <Tr key={i}>
                    <Td>{l.file}</Td>
                    <Td className="[overflow-wrap:anywhere]">
                      {l.name || l.email || "Unknown"}
                    </Td>
                    <Td>{l.outcome}</Td>
                    <Td>{l.reason}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {leftOutTotal > leftOut.length && (
              <p className={NOTE}>
                Showing {leftOut.length} of {leftOutTotal}. The report has them
                all.
              </p>
            )}
          </div>
        )}

        <div className={ACTIONS}>
          {zip ? (
            <Primary
              type="button"
              onClick={() =>
                save(zip.name, "application/zip", fromBase64(zip.base64))
              }
            >
              <DownloadSimpleIcon aria-hidden /> Download {zip.name}
            </Primary>
          ) : (
            files.map((f) => (
              <Primary
                key={f.name}
                type="button"
                onClick={() => save(f.name, f.mime, f.text ?? "")}
              >
                <DownloadSimpleIcon aria-hidden /> Download {f.name}
              </Primary>
            ))
          )}
          {report && (
            <Secondary
              type="button"
              onClick={() => save(report.name, "text/csv", report.text)}
            >
              Download left-out report
            </Secondary>
          )}
        </div>
      </div>
    </Panel>
  );
}
