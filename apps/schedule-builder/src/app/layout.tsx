import { Footer } from "~/components/Footer";
import { QueryProvider } from "~/components/providers/QueryProvider";
import { SessionProvider } from "~/components/providers/SessionProvider";
import { TermProvider } from "~/components/providers/TermProvider";
import { ToastProvider } from "~/hooks/useToast";
import "~/styles/globals.css";
import { APPS } from "@devdogsuga/og";
import { type Metadata } from "next";
import { Hanken_Grotesk, Alan_Sans, Cascadia_Code } from "next/font/google";
import { db } from "~/server/db";
import { availableTerms } from "~/server/db/schema";

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Alan_Sans({
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = Cascadia_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

// icon.tsx/apple-icon.tsx generate the favicons from the same drawing, so
// there is deliberately no `icons` entry here to compete with them.
export const metadata: Metadata = {
  title: {
    default: `${APPS.dogdays.name} — ${APPS.dogdays.tagline}`,
    template: `%s — ${APPS.dogdays.name}`,
  },
  description: APPS.dogdays.blurb,
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialTerms = await db.select().from(availableTerms);

  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets `.dark` before first paint so a stored theme choice (or the
            system preference) never flashes the wrong scheme. Kept inline and
            tiny; the ThemeSwitcher owns it after hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-background text-foreground flex min-h-screen flex-col">
        <QueryProvider>
          <SessionProvider>
            <TermProvider initialTerms={initialTerms}>
              <ToastProvider>
                <main className="relative flex flex-1 flex-col">
                  {children}
                </main>
                <Footer />
              </ToastProvider>
            </TermProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
