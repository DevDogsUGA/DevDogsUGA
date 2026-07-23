import Link from "next/link";
import type { ComponentProps } from "react";

export default function LinkButton({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={
        "relative flex items-center justify-center gap-[1ch] transition-[translate,box-shadow,background-color,color] disabled:opacity-75 disabled:not-data-pending:cursor-not-allowed data-pending:cursor-progress " +
        className
      }
    />
  );
}
