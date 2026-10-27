"use client";

import "./collapsible.css";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

const DisclosureContext = React.createContext(false);

/**
 * Radix Collapsible. Bare by default (the docs sidebar and the TOC style their
 * own triggers); `disclosure` dresses it as the docs `.dt` card with a caret
 * that turns when open.
 */
function Collapsible({
  disclosure = false,
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root> & {
  disclosure?: boolean;
}) {
  return (
    <DisclosureContext.Provider value={disclosure}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        className={cn(disclosure && "dt", className)}
        {...props}
      />
    </DisclosureContext.Provider>
  );
}

const caret = <CaretRightIcon weight="bold" className="dt-caret" aria-hidden />;

/**
 * With `disclosure` the caret leads the trigger. Under `asChild` the trigger
 * must stay a single element for Radix's Slot, so the caret goes inside the
 * child (before its own children) instead of beside it.
 */
function CollapsibleTrigger({
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  const disclosure = React.useContext(DisclosureContext);
  let content = children;
  if (disclosure) {
    if (asChild) {
      const child = React.Children.only(children);
      content = React.isValidElement<{ children?: React.ReactNode }>(child)
        ? React.cloneElement(child, undefined, caret, child.props.children)
        : child;
    } else {
      content = (
        <>
          {caret}
          {children}
        </>
      );
    }
  }
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      asChild={asChild}
      {...props}
    >
      {content}
    </CollapsiblePrimitive.CollapsibleTrigger>
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
