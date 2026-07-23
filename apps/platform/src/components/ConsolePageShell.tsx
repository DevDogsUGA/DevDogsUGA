import type { PropsWithChildren, ReactNode } from "react";
import AccentBlobs, { type AccentColor } from "~/ui/accent-blobs";
import PageHeader from "~/components/PageHeader";

interface ConsolePageShellProps extends PropsWithChildren {
  accent: AccentColor;
  title: string;
  description?: ReactNode;
}

export default function ConsolePageShell({
  accent,
  title,
  description,
  children,
}: ConsolePageShellProps) {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent={accent} />
      <PageHeader title={title} description={description} accent={accent} />
      {children}
    </div>
  );
}
