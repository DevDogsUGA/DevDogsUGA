"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import VerificationDialog from "~/components/VerificationDialog";
import type { HighestRankingRole } from "~/server/actions/permissions";
import type { profiles } from "~/server/db/schema";

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
  profile: typeof profiles.$inferSelect;
  highestRole: HighestRankingRole;
}

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

const NavUserContext = createContext<NavUserClientData | null>(null);
const VerificationContext = createContext<VerificationContextValue | null>(
  null,
);

type Setter = (
  navUser: NavUserClientData | null,
  verification: VerificationData | null,
) => void;

const SetterContext = createContext<Setter>(() => undefined);

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
  const [navUser, setNavUser] = useState<NavUserClientData | null>(null);
  const [verification, setVerification] = useState<VerificationData | null>(
    null,
  );

  const setter: Setter = useCallback((nav, ver) => {
    setNavUser(nav);
    setVerification(ver);
  }, []);

  return (
    <SetterContext.Provider value={setter}>
      <NavUserContext.Provider value={navUser}>
        <VerificationRoot data={verification}>{children}</VerificationRoot>
      </NavUserContext.Provider>
    </SetterContext.Provider>
  );
}

/**
 * Rendered by the streamed user cluster to push per-request user data into
 * the client context, making it available to the whole page (e.g. the account
 * page's verification widgets) without a second fetch.
 */
export function NavUserHydrator({
  navUser,
  verification,
}: {
  navUser: NavUserClientData | null;
  verification: VerificationData | null;
}) {
  const setter = useContext(SetterContext);

  useLayoutEffect(() => {
    setter(navUser, verification);
  }, [navUser, verification, setter]);

  return null;
}
