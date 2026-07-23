"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ackVerifyWebhook,
  getUnverifiedReports,
  type UnverifiedReport,
} from "~/server/actions/moderation";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";

const STORAGE_KEY = "devdogs:localServerUrl";
const POLL_INTERVAL_MS = 3000;

type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface Props {
  clientId: string;
}

export default function WebhookConnectField({ clientId }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ConnectionState>("idle");
  const [connectError, setConnectError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    setUrl(localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    inFlight.current.clear();
    setState("idle");
  }, []);

  const deliverReport = useCallback(
    async (report: UnverifiedReport) => {
      if (inFlight.current.has(report.id)) return;
      inFlight.current.add(report.id);

      const payload = {
        event: "report.verify" as const,
        reportId: report.id,
        reporterUserId: report.reporterUserId,
        reportedUserId: report.reportedUserId,
        contentId: report.contentId,
        contentSnapshot: report.contentSnapshot,
        contentUrl: report.contentUrl,
        description: report.description,
        reason: report.reason,
        contentType: report.contentType,
      };

      let status = 0;
      try {
        const res = await fetch(urlRef.current, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        status = res.status;
      } catch {
        inFlight.current.delete(report.id);
        return;
      }

      if (status >= 200 && status < 300) {
        await ackVerifyWebhook(report.id, true);
        router.refresh();
      } else if (status >= 400 && status < 500) {
        await ackVerifyWebhook(report.id, false);
      } else {
        inFlight.current.delete(report.id);
      }
    },
    [router],
  );

  const poll = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      const reports = await getUnverifiedReports(clientId);
      await Promise.allSettled(reports.map(deliverReport));
    } catch {
      // silently skip failed polls
    }
  }, [clientId, deliverReport]);

  async function handleConnect() {
    const target = url.trim();
    if (!target) return;
    setState("connecting");
    setConnectError(null);

    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "report.ping" }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setState("connected");
      pollRef.current = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    } catch (e) {
      setState("error");
      setConnectError(
        e instanceof Error ? e.message : "Failed to connect. Check the URL and CORS settings.",
      );
    }
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setUrl(v);
    localStorage.setItem(STORAGE_KEY, v);
    if (state === "connected") disconnect();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-md gap-1.5">
        <Input
          mono
          className="text-sm"
          name="webhookUrl"
          type="url"
          value={url}
          onChange={handleUrlChange}
          placeholder="http://localhost:3000/webhooks/devdogs"
          disabled={state === "connected"}
        />
        {state === "connected" ? (
          <FormButton
            theme="black"
            type="button"
            className="text-sm text-nowrap"
            onClick={disconnect}
          >
            Disconnect
          </FormButton>
        ) : (
          <FormButton
            theme="black"
            type="button"
            className="text-sm text-nowrap"
            disabled={!url.trim() || state === "connecting"}
            onClick={() => { void handleConnect(); }}
          >
            {state === "connecting" ? "Connecting…" : "Connect"}
          </FormButton>
        )}
      </div>

      {state === "connected" && (
        <p className="text-xs text-green-400">
          ● Connected — relaying report.verify webhooks to your local server
        </p>
      )}
      {connectError && <p className="text-xs text-rose-400">{connectError}</p>}

      <p className="max-w-md text-xs text-mauve-400">
        Clicking Connect sends a <code className="text-mauve-200">report.ping</code> to
        verify the URL is reachable. While connected, unverified reports from your test
        accounts are delivered directly from your browser — no ngrok needed. Your server
        must allow CORS from this origin.
      </p>
    </div>
  );
}
