"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, CaretUpDownIcon } from "@phosphor-icons/react/ssr";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "~/lib/cn";

type RootProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root>;

interface SelectProps extends RootProps {
  placeholder?: string;
  /**
   * Applied to the trigger, since that is the element a caller sizes. Callers
   * that size it from the parent instead (`*:flex-1`, `*:w-full`) need
   * nothing here.
   */
  className?: string;
  /**
   * Also the trigger's: Root renders no DOM, so a label spread onto it would
   * be dropped. Needed wherever the chosen value alone does not say what the
   * control selects.
   */
  "aria-label"?: string;
  children: React.ReactNode;
}

function Select({
  placeholder,
  className,
  "aria-label": ariaLabel,
  children,
  ...props
}: SelectProps) {
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "group flex items-center justify-between gap-2 rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white hover:border-mauve-500 hover:inset-shadow-sm focus:outline-none data-placeholder:text-mauve-500",
          className,
        )}
      >
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

interface ItemProps extends ComponentPropsWithoutRef<
  typeof SelectPrimitive.Item
> {
  /**
   * Drawn before the label, inside ItemText — so the trigger shows the mark
   * beside the chosen value rather than the label alone.
   */
  icon?: React.ReactNode;
  /**
   * One line under the label. Deliberately outside ItemText: Radix clones
   * that node into the trigger, and a description belongs in the open list,
   * not in the closed control.
   */
  description?: string;
}

function SelectItem({ children, icon, description, ...props }: ItemProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-default gap-2 py-1.5 pr-3 pl-8 text-sm text-white select-none focus:bg-mauve-700 focus:outline-none data-disabled:pointer-events-none data-disabled:opacity-40",
        // A described row is two lines tall, so its check and mark align to
        // the label rather than to the middle of the pair.
        description ? "items-start" : "items-center",
      )}
      {...props}
    >
      <span
        className={cn(
          "absolute left-2.5 flex items-center",
          description && "top-2",
        )}
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5 text-mauve-400" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* Bounded, or the popover grows to fit the longest description on one
          line — well past the sidebar and the mobile sheet it opens inside. */}
      <span
        className={cn(
          "flex min-w-0 flex-col gap-0.5",
          description && "max-w-56",
        )}
      >
        <SelectPrimitive.ItemText>
          {icon ? (
            <span className="flex items-center gap-2">
              {icon}
              {children}
            </span>
          ) : (
            children
          )}
        </SelectPrimitive.ItemText>
        {description && (
          <span className="text-xs/relaxed text-mauve-400">{description}</span>
        )}
      </span>
    </SelectPrimitive.Item>
  );
}

export default Object.assign(Select, { Item: SelectItem });
