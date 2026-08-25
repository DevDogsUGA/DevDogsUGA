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
        "relative flex cursor-default gap-2 pr-3 pl-8 text-sm text-white select-none focus:outline-none data-disabled:pointer-events-none data-disabled:opacity-40",
        // A described row is two lines tall, so its check and mark align to
        // the label rather than to the middle of the pair.
        description
          ? // Matched to the navbar's Docs menu row, so the two project lists
            // read as one control in two places: same vertical rhythm, same
            // rounded highlight inset from the panel edge, same hover fill.
            // The check gutter is the one thing that does not carry over — a
            // menu of links marks the current page with a background, and a
            // select has to say which option is chosen even while another is
            // hovered.
            "mx-1 items-start rounded-md py-2 focus:bg-mauve-800"
          : "items-center py-1.5 focus:bg-mauve-700",
      )}
      {...props}
    >
      <span
        className={cn(
          "absolute left-2.5 flex items-center",
          // Boxed to the first row's height and aligned to its top, rather
          // than nudged down by a magic offset: the row is as tall as the
          // mark when there is one and as tall as the label when there is
          // not, and centring inside that box lands the check on the label
          // either way.
          description && "top-2 h-6",
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
            // gap-2.5 and `font-medium` are the navbar row's, not this
            // component's own taste — the two lists sit one above the other on
            // a docs page and any difference reads as a mistake.
            <span
              className={cn(
                "flex items-center gap-2.5",
                description && "font-medium",
              )}
            >
              {icon}
              {children}
            </span>
          ) : (
            children
          )}
        </SelectPrimitive.ItemText>
        {description && (
          <span
            className={cn(
              "text-xs/relaxed text-mauve-400",
              // Under the NAME, not under the mark. The navbar puts its mark
              // beside a name+description column, so both lines share a left
              // edge; here the mark has to live inside ItemText to reach the
              // trigger, which would otherwise leave the description starting
              // a mark-width to the left of the name it belongs to. 2.125rem
              // is the mark (size-6) plus the gap-2.5 above.
              icon && "pl-[2.125rem]",
            )}
          >
            {description}
          </span>
        )}
      </span>
    </SelectPrimitive.Item>
  );
}

/**
 * A labelled run of items.
 *
 * Radix's Group is what ties the heading to its rows for assistive tech — the
 * Label is announced as the group's name rather than read as another option —
 * so this is a real grouping and not a styled separator row.
 */
function SelectGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Group>
      {/* `pl-9` lands the heading over the marks below it, the way the navbar
          menu's heading sits over its own: 4px of item margin plus the 32px
          check gutter. Aligning it to the panel edge instead would leave every
          heading a gutter-width left of everything it labels. */}
      <SelectPrimitive.Label className="pt-2 pr-3 pb-1 pl-9 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
        {label}
      </SelectPrimitive.Label>
      {children}
    </SelectPrimitive.Group>
  );
}

export default Object.assign(Select, { Item: SelectItem, Group: SelectGroup });
