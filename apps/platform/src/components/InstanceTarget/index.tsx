"use client";

import {
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { InstanceTargetContext, type TargetStatus } from "./context";
import { buildTargetClient, type TargetConfig } from "./targetClient";

/**
 * Per-browser, following the `devdogs:localServerUrl` convention the retired
 * webhook relay used. Never stored server-side: which database a contributor
 * points at is their business, and persisting it here would make production
 * hold a list of everyone's dev endpoints.
 */
const STORAGE_KEY = "devdogs:instanceTarget";

function readStored(): TargetConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TargetConfig>;
    if (typeof parsed.url !== "string" || typeof parsed.key !== "string") {
      return null;
    }
    return { url: parsed.url, key: parsed.key };
  } catch {
    return null;
  }
}

export default function InstanceTarget({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<TargetStatus>({ state: "idle" });
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const connect = useCallback(async (config: TargetConfig) => {
    const url = config.url.trim().replace(/\/$/, "");
    const key = config.key.trim();
    if (!url || !key) {
      setStatus({
        state: "error",
        message: "Both a URL and a key are required.",
      });
      return;
    }

    setStatus({ state: "checking" });

    const client = buildTargetClient({ url, key });

    // Read the tier rather than asking the operator to assert it. The refusal
    // below is the point of the whole control: these tools seed personas, file
    // reports and quarantine content, and none of that may ever land on
    // production data by a mistyped hostname.
    const { data, error } = await client
      .from("instance")
      .select("environment")
      .single();

    if (error) {
      setStatus({
        state: "error",
        message:
          `Could not read platform."instance" from ${url}: ${error.message}. ` +
          "Check the URL and publishable key, and that migrations have been applied.",
      });
      return;
    }

    const environment = data.environment as "local" | "test" | "production";
    if (environment === "production") {
      setStatus({
        state: "error",
        message:
          `${url} reports itself as a production instance, so the tools will not target it. ` +
          "Point them at your own stack (`pnpm sb start-local-stack`) or a test project.",
      });
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, key }));

    const { data: userData } = await client.auth.getUser();
    setSessionEmail(userData.user?.email ?? null);
    setStatus({ state: "ready", config: { url, key }, environment, client });
    setRevision((r) => r + 1);
  }, []);

  const disconnect = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSessionEmail(null);
    setStatus({ state: "idle" });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (status.state !== "ready") return;
      const { data, error } = await status.client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
      setSessionEmail(data.user?.email ?? null);
      setRevision((r) => r + 1);
    },
    [status],
  );

  const signOut = useCallback(async () => {
    if (status.state !== "ready") return;
    await status.client.auth.signOut();
    setSessionEmail(null);
    setRevision((r) => r + 1);
  }, [status]);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  // Reconnect to whatever this browser was last pointed at. The check runs
  // again rather than trusting the stored value: an instance can be promoted to
  // production between visits, and the stored config would still look fine.
  useEffect(() => {
    const stored = readStored();
    if (stored) void connect(stored);
  }, [connect]);

  return (
    <InstanceTargetContext.Provider
      value={{
        status,
        sessionEmail,
        connect,
        disconnect,
        signIn,
        signOut,
        revision,
        refresh,
      }}
    >
      {children}
    </InstanceTargetContext.Provider>
  );
}
