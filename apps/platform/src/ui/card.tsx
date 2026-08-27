import type {
  ComponentPropsWithoutRef,
  PropsWithChildren,
  ReactNode,
} from "react";

function Root({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      {...props}
      // scroll-mt clears the h-16 sticky TopNav when search jumps to #id.
      className={`w-full scroll-mt-20 rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-4 shadow-lg shadow-black/30 ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

/**
 * A card's title, and the `h2` under the page's `h1`.
 *
 * `description` exists because the alternative was passing a `<p>` as the
 * action child, which put a summary line into a flex row built for a title and
 * a button — the audit log did exactly that. Actions still go in `children`.
 */
function Header({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-extrabold tracking-widest text-mauve-500 uppercase">
          {title}
        </h2>
        {children}
      </div>
      {description && (
        <p className="max-w-prose text-sm text-mauve-400">{description}</p>
      )}
    </div>
  );
}

function Content({ children }: PropsWithChildren) {
  return <div className="divide-y divide-mauve-800 *:py-6">{children}</div>;
}

export const ConsoleCard = { Root, Header, Content };
