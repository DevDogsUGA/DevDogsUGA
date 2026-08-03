"use client";

import { createContext, useContext } from "react";
import type { TargetClient, TargetConfig } from "./targetClient";

/**
 * Which Supabase instance the contributor tooling is pointed at.
 *
 * These pages run on devdogsuga.org but act on a *different* database — the
 * contributor's own local stack or throwaway project. That inversion is the
 * whole design: the forum lives in another repository, and a forum contributor
 * should not have to clone and boot this monorepo just to get a moderation
 * queue.
 *
 * It works because the contract is RPCs (see `@devdogsuga/moderation`), so a
 * tool needs nothing but a URL, a publishable key, and a session — there is no
 * server-side loader to replicate. And because browsers treat `http://localhost`
 * as a potentially trustworthy origin, an HTTPS page may call
 * `http://127.0.0.1:54321` without tripping mixed-content blocking.
 */

export type { TargetConfig, TargetClient } from "./targetClient";

export type TargetStatus =
  /** No instance configured yet. */
  | { state: "idle" }
  /** Verifying the instance answers and is not production. */
  | { state: "checking" }
  /** Reachable and safe to act on. */
  | {
      state: "ready";
      config: TargetConfig;
      environment: "local" | "test";
      client: TargetClient;
    }
  /** Unreachable, or refused. */
  | { state: "error"; message: string };

export interface InstanceTargetValue {
  status: TargetStatus;
  /** The signed-in user's email on the *target*, not on devdogsuga.org. */
  sessionEmail: string | null;
  connect: (config: TargetConfig) => Promise<void>;
  disconnect: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Bumped after a sign-in/out so dependent panels refetch. */
  revision: number;
  refresh: () => void;
}

export const InstanceTargetContext = createContext<InstanceTargetValue | null>(
  null,
);

export function useInstanceTarget(): InstanceTargetValue {
  const value = useContext(InstanceTargetContext);
  if (!value) {
    throw new Error("useInstanceTarget must be used inside <InstanceTarget>");
  }
  return value;
}
