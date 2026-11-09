/**
 * The chrome-free ground for a display that's meant to fill its own popup
 * window and stand in for a slide, not read as a page inside the site.
 *
 * No TopNav, no announcement banner, no Footer, no console shell -- the same
 * reasoning as `(auth)`'s layout (see its doc comment), for the same reason:
 * the `(site)` layout owns `<main>` and always renders its own chrome around
 * whatever page is underneath it, so a route that wants none of that needs
 * its own group rather than a per-page override. A route group adds no URL
 * segment, so the page underneath keeps its exact path.
 *
 * Still nested inside the root `layout.tsx`, so fonts, the dark theme class,
 * the CSP nonce plumbing, and the query/tooltip providers all apply exactly
 * as they do everywhere else -- only the *site* chrome is gone.
 */
export default function PresentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-mauve-950">{children}</div>
  );
}
