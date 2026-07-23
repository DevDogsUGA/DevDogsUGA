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
            {children}
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
