/**
 * The chrome-free ground for the OAuth approval steps.
 *
 * No TopNav, no announcement banner, no Footer, deliberately. The consent
 * screen is an interstitial handed to someone in the middle of authorizing a
 * client, and site navigation around it would make it read as a page you can
 * browse away from, leaving the authorization half-finished.
 *
 * It is its own route group rather than a page-level override because the
 * (site) layout owns `<main>`, and nesting a second one inside it was the
 * other half of the bug. A route group adds no URL segment, so the page
 * underneath has an `/oauth/*` path.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] px-4 py-10"
    >
      {children}
    </main>
  );
}
