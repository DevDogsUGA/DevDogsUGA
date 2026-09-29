"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import VerificationDialog from "~/components/VerificationDialog";
import type { ConsoleItem } from "~/config/nav";
import type { HighestRankingRole } from "~/server/actions/permissions";
import type { profiles } from "~/server/db/schema";
import { isSessionCookieName } from "~/supabase/sessionCookie";

export interface VerificationStatus {
  hasPronouns: boolean;
  hasGraduationDate: boolean;
  hasGithub: boolean;
  hasDiscord: boolean;
  nameMatchesInvolvement: boolean;
}

export interface VerificationData {
  userId: string;
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  involvementFullName: string | null;
}

export interface NavUserClientData {
  profile: Pick<typeof profiles.$inferSelect, "userId" | "preferredName">;
  highestRole: HighestRankingRole;
}

/** `GET /me`'s body: the signed-in viewer, or `null` when signed out. */
export type MeResponse = {
  user: NavUserClientData;
  verification: VerificationData | null;
  /** Console pages this viewer may see. Already filtered server-side. */
  consoleItems: ConsoleItem[];
} | null;

/**
 * The navbar's view of the viewer: `undefined` until `/me` answers, then the
 * answer. Pages render before it arrives, so the server HTML and the first
 * client render both show the loading state.
 */
export type MeState = MeResponse | undefined;

interface VerificationContextValue {
  userId: string;
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  involvementFullName: string | null;
  completed: number;
  total: number;
  dialogOpen: boolean;
  openDialog: () => void;
  setDialogOpen: (open: boolean) => void;
}

const MeContext = createContext<MeState>(undefined);
const NavUserContext = createContext<NavUserClientData | null>(null);
const VerificationContext = createContext<VerificationContextValue | null>(
  null,
);

export const ME_QUERY_KEY = ["me"] as const;

/**
 * Without a session cookie there is nobody to look up, so a signed-out visitor
 * costs no request. The cookie isn't `httpOnly`; see `isSessionCookieName`.
 */
function hasSessionCookie(): boolean {
  return document.cookie
    .split(";")
    .some((pair) => isSessionCookieName(pair.split("=")[0]?.trim() ?? ""));
}

async function fetchMe(): Promise<MeResponse> {
  if (!hasSessionCookie()) return null;
  const response = await fetch("/me", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`GET /me failed: ${response.status}`);
  return (await response.json()) as MeResponse;
}

/** The whole `/me` answer, for the navbar's own clusters. */
export function useMe(): MeState {
  return useContext(MeContext);
}

/**
 * Marks the viewer signed out right away, for the sign-out form: the server
 * action redirects, and the navbar shouldn't keep showing the avatar until the
 * next `/me` round trip.
 */
export function useClearMe(): () => void {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.setQueryData<MeResponse>(ME_QUERY_KEY, null),
    [queryClient],
  );
}

export function useNavUser(): NavUserClientData | null {
  return useContext(NavUserContext);
}

export function useVerification(): VerificationContextValue | null {
  return useContext(VerificationContext);
}

function VerificationRoot({
  data,
  children,
}: {
  data: VerificationData | null;
  children: ReactNode;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const openDialog = useCallback(() => setDialogOpen(true), []);

  // Auto-open the checklist once per session for unverified users. The data
  // arrives via the hydrator after mount, so react to it becoming available.
  const shouldAutoOpen = data !== null && !data.isVerified;
  useEffect(() => {
    if (!shouldAutoOpen) return;
    try {
      if (!sessionStorage.getItem("devdogs:verificationDialogSeen")) {
        sessionStorage.setItem("devdogs:verificationDialogSeen", "1");
        // Intentional: auto-open the checklist once per session when the
        // hydrated data reveals the user is unverified.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDialogOpen(true);
      }
    } catch {
      // sessionStorage unavailable (e.g. private-mode restrictions)
    }
  }, [shouldAutoOpen]);

  if (!data) return <>{children}</>;

  const completed = Object.values(data.verificationStatus).filter(
    Boolean,
  ).length;

  return (
    <VerificationContext.Provider
      value={{
        userId: data.userId,
        verificationStatus: data.verificationStatus,
        isVerified: data.isVerified,
        involvementFullName: data.involvementFullName,
        completed,
        total: 5,
        dialogOpen,
        openDialog,
        setDialogOpen,
      }}
    >
      {children}
      <VerificationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </VerificationContext.Provider>
  );
}

export default function NavUserProvider({ children }: { children: ReactNode }) {
  // Stale after a minute, so returning to the tab after signing in or out
  // elsewhere refetches on focus. `NavUserRefresh` covers changes made here.
  const { data } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
  });

  return (
    <MeContext.Provider value={data}>
      <NavUserContext.Provider value={data?.user ?? null}>
        <VerificationRoot data={data?.verification ?? null}>
          {children}
        </VerificationRoot>
      </NavUserContext.Provider>
    </MeContext.Provider>
  );
}

/**
 * Refetches `/me` whenever the server re-renders the layout that renders this.
 *
 * `revision` is a fresh `{}` from a server component, so every RSC payload
 * that carries the layout arrives with a new identity: a `router.refresh()`,
 * a server action that revalidated, the router's own refetches. Those are the
 * moments the old server-rendered navbar picked up a changed name, avatar,
 * role or verification checklist, so this keeps that behaviour without the
 * page reading the session. The first render is skipped; the query is already
 * fetching then.
 */
export function NavUserRefresh({ revision }: { revision: object }) {
  const queryClient = useQueryClient();
  const first = useRef(revision);

  useEffect(() => {
    if (revision === first.current) return;
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [revision, queryClient]);

  return null;
}
