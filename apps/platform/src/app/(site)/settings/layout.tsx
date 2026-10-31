import type { Metadata } from "next";

/**
 * Everything under `/settings` is one person's own account, so none of it
 * belongs in a search result. Declared here so a page added later is covered
 * without a second decision; each page calls `requireSignedIn`, which
 * knows the page it is gating.
 */
export const metadata: Metadata = {
  title: "Settings | DevDogs",
  robots: { index: false },
};

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
