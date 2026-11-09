import * as React from "react";
import { cn } from "~/lib/cn";

interface DefinitionListProps extends React.ComponentProps<"dl"> {
  items: { term: React.ReactNode; detail: React.ReactNode; key?: string }[];
}

/** Record details as a term column and a detail column; stacks on phones. */
export function DefinitionList({
  items,
  className,
  ...props
}: DefinitionListProps) {
  return (
    <dl
      data-slot="definition-list"
      className={cn(
        "grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[8.75rem_1fr] sm:gap-y-3",
        className,
      )}
      {...props}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.key ?? i}>
          <dt className="text-xs font-extrabold tracking-widest text-mauve-500 uppercase sm:pt-0.5">
            {item.term}
          </dt>
          <dd className="mb-2 min-w-0 break-words text-white sm:mb-0">
            {item.detail}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
