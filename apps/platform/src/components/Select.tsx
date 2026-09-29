"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import {
  ArrowRightIcon,
  CaretUpDownIcon,
  CheckIcon,
} from "@phosphor-icons/react/ssr";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "~/lib/cn";

type RootProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root>;

interface SelectProps extends RootProps {
  placeholder?: string;
  /**
   * Applied to the trigger, since that is the element a caller sizes. Callers
   * that size it from the parent instead (`*:flex-1`, `*:w-full`) need nothing
   * here.
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
        data-select-trigger
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
   * Drawn before the label, inside ItemText, so the trigger shows the mark
   * beside the chosen value rather than the label alone.
   */
  icon?: React.ReactNode;
  /**
   * One line under the label, cut short rather than wrapped. Deliberately
   * outside ItemText: Radix clones that node into the trigger, and a
   * description belongs in the open list, not in the closed control.
   */
  description?: string;
}

function SelectItem({ children, icon, description, ...props }: ItemProps) {
  if (icon && description) {
    return (
      <DescribedItem icon={icon} description={description} {...props}>
        {children}
      </DescribedItem>
    );
  }

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
      <SelectPrimitive.ItemText>
        {icon ? (
          <span className="flex items-center gap-2.5">
            {icon}
            {children}
          </span>
        ) : (
          children
        )}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/**
 * A two-line row: the mark in a slot of its own, centred on the name and the
 * description together, with no separate check gutter. The chosen row swaps
 * its mark for an arrow, so which option is chosen still shows while another
 * is hovered.
 *
 * The mark also sits inside ItemText, hidden in the list and shown only once
 * Radix has cloned that node into the trigger, so the closed control keeps the
 * mark beside the chosen name.
 */
function DescribedItem({
  children,
  icon,
  description,
  ...props
}: ItemProps & { icon: React.ReactNode; description: string }) {
  return (
    <SelectPrimitive.Item
      className="group/item relative mx-1 flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-white select-none focus:bg-mauve-800 focus:outline-none data-disabled:pointer-events-none data-disabled:opacity-40"
      {...props}
    >
      <span className="relative flex shrink-0">
        <span className="flex group-data-[state=checked]/item:invisible">
          {icon}
        </span>
        <SelectPrimitive.ItemIndicator className="absolute inset-0 flex items-center justify-center">
          <ArrowRightIcon weight="bold" className="size-5 text-white" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* Bounded, so a long name cannot widen the popover past the sidebar
          and the mobile sheet it opens inside. */}
      <span className="flex max-w-52 min-w-0 flex-col gap-0.5">
        <SelectPrimitive.ItemText>
          <span className="flex items-center gap-2.5 font-medium">
            <span className="hidden [[data-select-trigger]_&]:flex">
              {icon}
            </span>
            {children}
          </span>
        </SelectPrimitive.ItemText>
        <span className="truncate text-xs text-mauve-400">{description}</span>
      </span>
    </SelectPrimitive.Item>
  );
}

export default Object.assign(Select, { Item: SelectItem });
