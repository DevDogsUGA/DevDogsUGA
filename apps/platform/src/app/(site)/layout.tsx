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
            {/* The fallback reserves a viewport rather than nothing, and it is
                the whole of the site's CLS.

                Measured: the document is 900px tall at first paint and 6,707px
                by 112ms, with a single 0.4038 layout shift at 103ms — four
                times the failing threshold, and the only shift on the page.
                With an empty fallback the shell flushes as chrome around a
                zero-height main, so `min-h-screen` on the column puts the
                footer at y=545, in view; then `children` arrives and throws it
                2,000px down. Blocking fonts does not move that number at all,
                and blocking an image only moves it by changing when the content
                lands, so neither was ever the cause.

                Reserving the height keeps the footer below the fold in both
                states, which is where it belongs on a page this long, so there
                is no visible shift to record. Note this boundary is only
                flushing early because it can: the comment above assumes Cache
                Components, which next.config.ts deliberately leaves off, so
                there is no static shell being served ahead of a dynamic hole —
                just chrome, briefly, around nothing. */}
            <Suspense fallback={<div className="min-h-screen" />}>
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
            The pre-paint hide script that keeps a dismissed notice from
            flashing up is rendered by the root layout — see
            ~/config/announcement for why it cannot live in this client
            component. Outside the flex column because a fixed element
            contributes nothing to that layout anyway. */}
        <AnnouncementBanner />

        <AppSwitcher />
        <Suspense>
          <AutoOpen />
        </Suspense>
      </AppSwitcherProvider>
    </NavUserProvider>
  );
}
