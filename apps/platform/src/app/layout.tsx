import "~/styles/globals.css";

import { Suspense } from "react";
import { type Metadata } from "next";
import {
  Alan_Sans,
  Cascadia_Code,
  Geist,
  Hanken_Grotesk,
} from "next/font/google";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import AnimationInit from "~/ui/animation-init";
import NavigationProgress from "~/ui/navigation-progress";
import QueryProvider from "~/ui/query-provider";
import Toaster from "~/components/Toaster";
import { cn } from "~/lib/cn";

export const metadata: Metadata = {
  title: "DevDogs",
  description:
    "DevDogs is a club at UGA devoted to bettering our community through open-source software.",
  applicationName: "DevDogs",
};

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans" });

const display = Alan_Sans({
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = Cascadia_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        display.variable,
        mono.variable,
        "font-sans",
        sans.variable,
      )}
      suppressHydrationWarning
    >
      <body className="bg-black text-mauve-950">
        {/* NavigationProgress and AnimationInit read usePathname(), which is
            dynamic under Cache Components and must sit inside a <Suspense>
            boundary. Both render null, so the prerendered shell shows nothing
            for them until they hydrate. */}
        <Suspense>
          <NavigationProgress />
        </Suspense>
        <TooltipProvider>
          <QueryProvider>
            <Suspense>
              <AnimationInit />
            </Suspense>
            <Toaster />
            {children}
          </QueryProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
