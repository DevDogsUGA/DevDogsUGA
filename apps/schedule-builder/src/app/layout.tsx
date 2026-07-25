import { Footer } from "~/components/Footer";
import { QueryProvider } from "~/components/providers/QueryProvider";
import { SessionProvider } from "~/components/providers/SessionProvider";
import { TermProvider } from "~/components/providers/TermProvider";
import { ToastProvider } from "~/hooks/useToast";
import "~/styles/globals.css";
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

export const metadata: Metadata = {
  title: "UGA Optimal Schedule Builder",
  description:
    "Optimal Schedule Builder web application for UGA students to generate and design optimal academic schedules",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialTerms = await db.select().from(availableTerms);

  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-pink-50">
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
