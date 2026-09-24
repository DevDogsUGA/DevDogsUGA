import { Footer } from "~/components/Footer";
import { QueryProvider } from "~/components/providers/QueryProvider";
import { SessionProvider } from "~/components/providers/SessionProvider";
import { TermProvider } from "~/components/providers/TermProvider";
import { ToastProvider } from "~/hooks/useToast";
import "~/styles/globals.css";
import { APPS } from "@devdogsuga/open-graph";
import { type Metadata } from "next";
import { headers } from "next/headers";
import { Hanken_Grotesk, Alan_Sans, Cascadia_Code } from "next/font/google";
import { db } from "~/server/db";
import { availableTerms } from "~/server/db/schema";
import { THEME_INIT_SCRIPT } from "~/config/theme-init-script";

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
  // Minted per-request in `middleware.ts`, carried on the plain `x-nonce`
  // request header for exactly this purpose -- see that file's doc comment.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets `.dark` before first paint so a stored theme choice (or the
            system preference) never flashes the wrong scheme. Kept inline and
            tiny; the ThemeSwitcher owns it after hydration. Nonced so it
            still runs under the enforcing `script-src 'nonce-…'
            'strict-dynamic'` policy -- see `middleware.ts` and
            `@devdogsuga/security-headers`'s `csp.ts`. Byte-identical to
            `global-error.tsx`'s copy (shared via `THEME_INIT_SCRIPT`), which
            earns CSP trust through a content hash instead, since it has no
            `headers()` access to a nonce. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
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
