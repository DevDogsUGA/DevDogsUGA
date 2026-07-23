import type { PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  className?: string;
}

export default function ConsoleTitle({ children, className }: Props) {
  return (
    <div
      className={`shadow-block-lg mx-auto w-full max-w-3xl rounded-sm border-2 border-black shadow-black ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-4 p-6">
        {children}
      </div>
    </div>
  );
}
