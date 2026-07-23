import { redirect } from "next/navigation";
import { expectUserWith } from "~/server/auth";

export default async function ToolsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await expectUserWith({
    profile: true,
  }).catch(() => redirect("/auth"));

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">{children}</div>
  );
}
