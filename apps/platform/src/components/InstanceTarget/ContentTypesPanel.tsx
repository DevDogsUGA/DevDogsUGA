"use client";

import { useState, useTransition } from "react";
import TargetedAppSelect from "./TargetedAppSelect";
import {
  PanelError,
  TargetGate,
  useTargetClient,
  useTargetQuery,
} from "./panels";

interface ContentType {
  contentType: string;
  tableName: string;
  label: string;
  refColumn: string | null;
  authorColumn: string | null;
  snapshotColumns: string[];
  visibility: "public" | "restricted";
  quarantineColumn: string | null;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface Conformance {
  contentType: string;
  tableName: string;
  checks: Check[];
}

const buttonClass =
  "self-start rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50";

/**
 * What the catalog detected for an app, and whether the integration holds up.
 *
 * Read-only, because there is nothing here to edit: content types are derived
 * from the app's own schema, so the way to change what this shows is to change
 * that schema. The conformance check is the successor to the retired
 * "Connect → send report.ping" button — that verified a URL answered, this
 * verifies the contract.
 */
export default function ContentTypesPanel() {
  return (
    <TargetGate>
      <Inner />
    </TargetGate>
  );
}

function Inner() {
  const client = useTargetClient();
  const [appSlug, setAppSlug] = useState("");
  const [conformance, setConformance] = useState<Conformance[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: types, error } = useTargetQuery<ContentType[]>(
    async (c) => {
      if (!appSlug) return [];
      const { data, error: err } = await c.rpc("list_content_types", {
        app_slug: appSlug,
      });
      if (err) throw new Error(err.message);
      return (data ?? []) as ContentType[];
    },
    [appSlug],
  );

  function runCheck() {
    if (!client) return;
    setCheckError(null);
    setConformance(null);
    startTransition(async () => {
      const { data, error: err } = await client.rpc("conformance_check", {
        app_slug: appSlug,
      });
      if (err) {
        setCheckError(err.message);
        return;
      }
      setConformance((data ?? []) as Conformance[]);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <TargetedAppSelect value={appSlug} onChange={setAppSlug} />

      {(types ?? []).length === 0 ? (
        <p className="text-sm text-mauve-400">
          Nothing in this app is moderatable yet. A table becomes content by
          gaining a foreign key to{" "}
          <code>platform.&quot;reportResolutions&quot;</code>; there is nothing
          to register here.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(types ?? []).map((t) => (
            <li
              key={t.contentType}
              className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {t.label}
                </span>
                <code className="text-xs text-mauve-400">{t.contentType}</code>
                {t.quarantineColumn ? (
                  <span className="rounded-sm bg-cyan-400/15 px-1.5 py-0.5 text-[0.65rem] text-cyan-300">
                    quarantinable
                  </span>
                ) : (
                  <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[0.65rem] text-mauve-300">
                    act on the user
                  </span>
                )}
                {t.visibility === "restricted" && (
                  <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[0.65rem] text-mauve-300">
                    snapshot withheld
                  </span>
                )}
              </div>
              <span className="text-xs text-mauve-400">
                {t.tableName} · addressed by {t.refColumn ?? "—"} · authored by{" "}
                {t.authorColumn ?? "—"} · snapshots{" "}
                {t.snapshotColumns.join(", ") || "nothing"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={runCheck}
        disabled={isPending || !appSlug}
        className={buttonClass}
      >
        {isPending ? "Checking…" : "Run conformance check"}
      </button>

      {conformance && (
        <ul className="flex flex-col gap-2">
          {conformance.map((c) => (
            <li
              key={c.contentType}
              className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="text-sm font-medium text-white">
                {c.contentType}{" "}
                <span className="text-xs text-mauve-400">({c.tableName})</span>
              </span>
              {c.checks.map((check) => (
                <div key={check.name} className="flex items-start gap-2">
                  <span
                    className={
                      check.ok
                        ? "text-xs text-emerald-400"
                        : "text-xs text-rose-400"
                    }
                  >
                    {check.ok ? "✓" : "✕"}
                  </span>
                  <span className="text-xs text-mauve-300">
                    <code className="text-mauve-400">{check.name}</code> —{" "}
                    {check.detail}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <PanelError message={checkError ?? error} />
    </div>
  );
}
