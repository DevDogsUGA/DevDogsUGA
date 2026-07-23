"use client";

import type { PropsWithChildren } from "react";

interface FieldProps extends PropsWithChildren {
  label: string;
  description?: string;
  htmlFor?: string;
  id?: string;
}

export default function Field({
  label,
  description,
  htmlFor,
  id,
  children,
}: FieldProps) {
  const header = (
    <div className="flex max-w-sm flex-col gap-2.5">
      <span className="text-base/none font-medium text-white">{label}</span>
      {description && (
        <span className="-mt-1 text-xs text-balance text-mauve-300">
          {description}
        </span>
      )}
    </div>
  );

  if (htmlFor) {
    return (
      <label id={id} className="flex flex-col gap-2.5" htmlFor={htmlFor}>
        {header}
        {children}
      </label>
    );
  }
  return (
    <div id={id} className="flex flex-col gap-2.5">
      {header}
      {children}
    </div>
  );
}
