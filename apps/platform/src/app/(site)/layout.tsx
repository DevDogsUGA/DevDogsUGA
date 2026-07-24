import { Suspense } from "react";
import AppSwitcher from "~/components/AppSwitcher";
import AutoOpen from "~/components/AppSwitcher/AutoOpen";
import { AppSwitcherProvider } from "~/components/AppSwitcher/provider";
import TopNav from "~/components/TopNav";
import NavUserProvider from "~/components/TopNav/NavUserProvider";

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
            <Suspense>{children}</Suspense>
          </main>
        </div>

        <AppSwitcher />
        <Suspense>
          <AutoOpen />
        </Suspense>
      </AppSwitcherProvider>
    </NavUserProvider>
  );
}
