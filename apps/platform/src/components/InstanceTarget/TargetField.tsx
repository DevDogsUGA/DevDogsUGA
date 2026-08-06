"use client";

import { useEffect, useState } from "react";
import { useInstanceTarget } from "./context";

const inputClass =
  "w-full max-w-sm rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white";
const buttonClass =
  "self-start rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Connects the tools to an instance, and signs in against it.
 *
 * Two separate sessions are in play on this page and conflating them is the
 * easy mistake: you are signed into devdogsuga.org as yourself, and separately
 * signed into the *target* as whoever you want to act as there. The panel keeps
 * both visible for that reason.
 */
export default function TargetField() {
  const { status, sessionEmail, connect, disconnect, signIn, signOut } =
    useInstanceTarget();

  const [url, setUrl] = useState("http://127.0.0.1:54321");
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("member@sandbox.test");
  const [password, setPassword] = useState("password");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status.state === "ready") {
      setUrl(status.config.url);
      setKey(status.config.key);
    }
  }, [status]);

  async function handleSignIn() {
    setAuthError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (status.state === "ready") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-lg border border-cyan-400/30 bg-cyan-400/5 px-3 py-2">
          <span className="text-xs tracking-wide text-cyan-300 uppercase">
            Acting on {status.environment}
          </span>
          <span className="font-mono text-sm break-all text-white">
            {status.config.url}
          </span>
        </div>

        {sessionEmail ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-mauve-300">
              Signed in there as{" "}
              <span className="text-white">{sessionEmail}</span>
            </span>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-mauve-300">
              Sign in as a seeded persona. Everything below acts as whoever this
              is — including what RLS lets you see.
            </p>
            <input
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@sandbox.test"
              autoComplete="off"
            />
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              autoComplete="off"
            />
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void handleSignIn()}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            {authError && <p className="text-xs text-rose-400">{authError}</p>}
          </div>
        )}

        <button type="button" className={buttonClass} onClick={disconnect}>
          Point somewhere else
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        className={inputClass}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://127.0.0.1:54321"
      />
      <input
        className={inputClass}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Publishable key (sb_publishable_…)"
        autoComplete="off"
      />
      <p className="text-xs text-mauve-400">
        Both are printed by <code>pnpm sb link</code>, and by{" "}
        <code>supabase status</code> at any time.
      </p>
      <button
        type="button"
        className={buttonClass}
        disabled={status.state === "checking"}
        onClick={() => void connect({ url, key })}
      >
        {status.state === "checking" ? "Checking…" : "Connect"}
      </button>
      {status.state === "error" && (
        <p className="text-xs text-rose-400">{status.message}</p>
      )}
    </div>
  );
}
