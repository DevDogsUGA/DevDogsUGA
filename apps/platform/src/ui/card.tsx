import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

function Root({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      {...props}
      className={`w-full rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-4 shadow-lg shadow-black/30 ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function Header({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs font-extrabold tracking-widest text-mauve-500 uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}

function Content({ children }: PropsWithChildren) {
  return <div className="divide-y divide-mauve-800 *:py-6">{children}</div>;
}

export const ConsoleCard = { Root, Header, Content };
