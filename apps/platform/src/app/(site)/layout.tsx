import { Suspense } from "react";
import AnnouncementBanner from "~/components/AnnouncementBanner";
import AppSwitcher from "~/components/AppSwitcher";
import AutoOpen from "~/components/AppSwitcher/AutoOpen";
import { AppSwitcherProvider } from "~/components/AppSwitcher/provider";
import Footer from "~/components/Footer";
import TopNav from "~/components/TopNav";
import NavUserProvider from "~/components/TopNav/NavUserProvider";
import AnimationInit from "~/ui/animation-init";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <NavUserProvider>
      <AppSwitcherProvider>
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main
            id="main-content"
            className="@container relative flex min-w-0 flex-1 flex-col"
          >
            {/* Page-content boundary. Under Cache Components the chrome above
                is the static shell and each page streams in as a dynamic hole,
                so pages that await uncached, session-gated data at the root are
                valid here. Pages wanting a richer loading state can nest their
                own <Suspense> with a skeleton (see account/page.tsx). */}
            <Suspense>
              {children}
              {/* Mounted inside the content boundary, not in the root layout.
                  AnimationInit adds `.is-visible` to [data-animate] elements,
                  and `class` is an attribute React owns on those nodes. From
                  the root layout it hydrated in its own boundary — ahead of the
                  page body — so it rewrote classes on server HTML React had not
                  hydrated yet, and React reported:

                    <section id="projects"
                    +  className="relative w-full overflow-hidden pt-(--sect..."
                    -  className="relative w-full overflow-hidden pt-(--sect..."
                       data-animate="fade-up">

                  React then re-rendered the subtree, which replaced the very
                  nodes the IntersectionObserver held — leaving those sections
                  stuck at their `opacity: 0` base state permanently. Committing
                  in the same boundary as `children` means the body is hydrated
                  before a single class is touched. */}
              <AnimationInit />
            </Suspense>
          </main>

          {/* Outside <main> so it is not part of the page landmark, and outside
              the Suspense boundary so it belongs to the static shell rather
              than streaming in with the page. `main` carries flex-1, so this
              sits at the bottom of short pages. */}
          <Footer />
        </div>

        {/* Last in the document, and fixed to the bottom of the viewport
            rather than to the end of the page — it stays in view the whole way
            down, which is what keeps a club-wide notice unmissable without
            handing it a second sticky layer at the top to fight TopNav for.
            Being last also means its pre-paint hide script has run before the
            markup it hides is ever parsed. Outside the flex column because a
            fixed element contributes nothing to that layout anyway. */}
        <AnnouncementBanner />

        <AppSwitcher />
        <Suspense>
          <AutoOpen />
        </Suspense>
      </AppSwitcherProvider>
    </NavUserProvider>
  );
}
