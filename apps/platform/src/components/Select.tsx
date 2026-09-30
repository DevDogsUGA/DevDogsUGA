"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { CaretUpDownIcon, CheckIcon } from "@phosphor-icons/react/ssr";
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
          {/* No padding: the chosen row's fill runs edge to edge. */}
          <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
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

/** The chosen row's check, at the row's right end. */
function Check() {
  return (
    <SelectPrimitive.ItemIndicator className="ml-auto flex shrink-0 pl-3">
      <CheckIcon weight="bold" className="size-4 text-emerald-400" />
    </SelectPrimitive.ItemIndicator>
  );
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
      className="relative flex cursor-default items-center gap-2 px-3 py-1.5 text-sm text-white select-none focus:outline-none focus:not-data-[state=checked]:bg-mauve-700 data-disabled:pointer-events-none data-disabled:opacity-40 data-[state=checked]:bg-mauve-950"
      {...props}
    >
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
      <Check />
    </SelectPrimitive.Item>
  );
}

/**
 * A two-line row: the mark, centred on the name and the description together.
 * The chosen row sits on a darker fill with a check at its right end, so which
 * option is chosen still shows while another is hovered.
 *
 * The mark and the description sit inside ItemText with the name, so the
 * closed control shows all three.
 */
function DescribedItem({
  children,
  icon,
  description,
  ...props
}: ItemProps & { icon: React.ReactNode; description: string }) {
  return (
    <SelectPrimitive.Item
      className="relative flex cursor-default items-center gap-2.5 px-3.5 py-2 text-sm text-white select-none focus:outline-none focus:not-data-[state=checked]:bg-mauve-800 data-disabled:pointer-events-none data-disabled:opacity-40 data-[state=checked]:bg-mauve-950"
      {...props}
    >
      <SelectPrimitive.ItemText>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex shrink-0">{icon}</span>
          {/* Bounded, so a long name cannot widen the popover past the
              sidebar and the mobile sheet it opens inside. */}
          <span className="flex max-w-52 min-w-0 flex-col gap-0.5 text-left">
            <span className="font-medium">{children}</span>
            <span className="truncate text-xs text-mauve-400">
              {description}
            </span>
          </span>
        </span>
      </SelectPrimitive.ItemText>
      <Check />
    </SelectPrimitive.Item>
  );
}

export default Object.assign(Select, { Item: SelectItem });
