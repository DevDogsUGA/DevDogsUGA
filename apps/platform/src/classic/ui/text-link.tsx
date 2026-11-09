import * as React from "react";
import { Slot } from "~/ui/slot";
import { cn } from "~/lib/cn";

type TextLinkProps = React.ComponentProps<"a"> & {
  /** Render the child (a `next/link`, say) with the text-link look. */
  asChild?: boolean;
};

/** An inline link in running text: underlined, brightening on hover. */
function TextLink({ className, asChild, ...props }: TextLinkProps) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      data-slot="text-link"
      className={cn(
        "rounded-xs underline underline-offset-4 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950",
        className,
      )}
      {...props}
    />
  );
}

export { TextLink };
export type { TextLinkProps };
