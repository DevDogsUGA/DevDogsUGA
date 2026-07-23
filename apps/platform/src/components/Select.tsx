"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, CaretUpDownIcon } from "@phosphor-icons/react/ssr";
import type { ComponentPropsWithoutRef } from "react";

type RootProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root>;

interface SelectProps extends RootProps {
  placeholder?: string;
  children: React.ReactNode;
}

function Select({ placeholder, children, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger className="group flex items-center justify-between gap-2 rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white hover:border-mauve-500 hover:inset-shadow-sm focus:outline-none data-placeholder:text-mauve-500">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <CaretUpDownIcon className="text-mauve-500" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 overflow-hidden rounded-sm border border-white/20 bg-mauve-900"
          position="item-aligned"
        >
          <SelectPrimitive.Viewport className="py-1">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

type ItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item>;

function SelectItem({ children, ...props }: ItemProps) {
  return (
    <SelectPrimitive.Item
      className="relative flex cursor-default items-center gap-2 py-1.5 pr-3 pl-8 text-sm text-white select-none focus:bg-mauve-700 focus:outline-none data-disabled:pointer-events-none data-disabled:opacity-40"
      {...props}
    >
      <span className="absolute left-2.5 flex items-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5 text-mauve-400" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export default Object.assign(Select, { Item: SelectItem });
