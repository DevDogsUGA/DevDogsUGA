"use client";

import type { TargetClient } from "./targetClient";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useInstanceTarget } from "./context";

/**
 * Shared plumbing for every panel that reads from the targeted instance.
 *
 * All of them have the same three non-happy states — not connected, not signed
 * in there, request failed — and conflating any of them with "no results" is
 * how a tool ends up showing an empty list when the real answer is "RLS denied
 * you". Each gets its own message, so an empty list means empty.
 */

export interface TargetQuery<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useTargetQuery<T>(
  run: (client: TargetClient) => Promise<T>,
  deps: unknown[],
): TargetQuery<T> {
  const { status, sessionEmail, revision } = useInstanceTarget();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const client = status.state === "ready" ? status.client : null;

  useEffect(() => {
    if (!client || !sessionEmail) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    run(client)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `run` is a fresh closure every render by design; the caller's `deps` are
    // what actually determine when this should re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sessionEmail, revision, tick, ...deps]);

  return {
    data,
    error,
    loading,
    reload: useCallback(() => setTick((t) => t + 1), []),
  };
}

/** The connected, signed-in client, or null. */
export function useTargetClient(): TargetClient | null {
  const { status, sessionEmail } = useInstanceTarget();
  return status.state === "ready" && sessionEmail ? status.client : null;
}

/** Renders `children` only once a panel could produce a real answer. */
export function TargetGate({ children }: { children: ReactNode }) {
  const { status, sessionEmail } = useInstanceTarget();

  if (status.state !== "ready") {
    return (
      <p className="text-sm text-mauve-400">
        Point the tools at an instance first.
      </p>
    );
  }
  if (!sessionEmail) {
    return (
      <p className="text-sm text-mauve-400">
        Sign in to that instance first — everything here runs under row-level
        security as whoever you are there.
      </p>
    );
  }
  return <>{children}</>;
}

export function PanelError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-rose-400">{message}</p>;
}
