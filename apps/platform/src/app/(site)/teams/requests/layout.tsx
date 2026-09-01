import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function TeamRequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (process.env.DEPLOY_ENV === "production") notFound();

  return children;
}
