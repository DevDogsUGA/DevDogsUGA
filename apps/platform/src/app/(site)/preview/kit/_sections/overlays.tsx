"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  GearIcon,
  QrCodeIcon,
  SignOutIcon,
  TrashIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/ssr";

import DialogShell from "~/ui/dialog-shell";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import { toast } from "~/lib/toast";
import { Button } from "~/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/ui/hover-card";
import { Input } from "~/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSection,
  SheetTitle,
} from "~/ui/sheet";
import Toast from "~/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/ui/tooltip";

/** Pinned triggers sit side by side from 720px; below that each gets its own row, with room for its open overlay. */
function pin(ml: number, mb: number): CSSProperties {
  return { "--ml": `${ml}px`, "--mb": `${mb}px` } as CSSProperties;
}

const PIN_CSS = `
.ov-pins { display: flex; flex-wrap: wrap; align-items: flex-start; }
.ov-pin { margin-left: var(--ml, 0); }
@media (max-width: 719px) {
  .ov-pins { flex-direction: column; flex-wrap: nowrap; gap: 0 !important; min-height: 0 !important; }
  .ov-pin { margin-left: 0; margin-bottom: var(--mb, 0); }
}
`;

const noop = () => undefined;
const keep = (e: Event) => e.preventDefault();

/**
 * A positioning context for an open overlay. `transform` makes it the
 * containing block of `position: fixed`, so a dialog or drawer pinned to it
 * stays inside the frame instead of covering the whole gallery.
 */
function Stage({
  height = 380,
  children,
}: {
  height?: number;
  children: (container: HTMLElement | null) => ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setEl}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        transform: "translateZ(0)",
        background:
          "repeating-linear-gradient(135deg, var(--surface) 0 14px, var(--bg) 14px 28px)",
      }}
    >
      {el ? children(el) : null}
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: 26 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {title}
      </div>
      {note && (
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          {note}
        </p>
      )}
      {children}
    </div>
  );
}

function MenuBody() {
  return (
    <>
      <DropdownMenuLabel>Signed in as @ava</DropdownMenuLabel>
      <DropdownMenuItem>
        <UserCircleIcon weight="bold" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem>
        <GearIcon weight="bold" />
        Account
        <DropdownMenuShortcut>G A</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled>
        <QrCodeIcon weight="bold" />
        Check in (closed)
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive">
        <TrashIcon weight="bold" />
        Delete account
      </DropdownMenuItem>
      <DropdownMenuItem>
        <SignOutIcon weight="bold" />
        Sign out
      </DropdownMenuItem>
    </>
  );
}

function PinnedMenus() {
  const [checks, setChecks] = useState({ a: true, b: false });
  const [radio, setRadio] = useState("week");
  return (
    <div className="ov-pins" style={{ gap: 24, minHeight: 340 }}>
      <style>{PIN_CSS}</style>
      <DropdownMenu open modal={false} onOpenChange={noop}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="ov-pin"
            style={pin(0, 270)}
          >
            Items
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          avoidCollisions={false}
          onInteractOutside={keep}
          onEscapeKeyDown={keep}
        >
          <MenuBody />
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu open modal={false} onOpenChange={noop}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="ov-pin"
            style={pin(200, 300)}
          >
            Check and radio
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          avoidCollisions={false}
          onInteractOutside={keep}
          onEscapeKeyDown={keep}
        >
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={checks.a}
            onCheckedChange={(v) => setChecks((c) => ({ ...c, a: v === true }))}
            onSelect={(e) => e.preventDefault()}
          >
            Major
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={checks.b}
            onCheckedChange={(v) => setChecks((c) => ({ ...c, b: v === true }))}
            onSelect={(e) => e.preventDefault()}
          >
            Graduation year
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Range</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={radio} onValueChange={setRadio}>
            <DropdownMenuRadioItem
              value="week"
              onSelect={(e) => e.preventDefault()}
            >
              This week
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="term"
              onSelect={(e) => e.preventDefault()}
            >
              This term
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu open modal={false} onOpenChange={noop}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="ov-pin"
            style={pin(200, 200)}
          >
            Submenu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          avoidCollisions={false}
          onInteractOutside={keep}
          onEscapeKeyDown={keep}
        >
          <DropdownMenuItem>Open</DropdownMenuItem>
          <DropdownMenuSub open onOpenChange={noop}>
            <DropdownMenuSubTrigger>Share</DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              onInteractOutside={keep}
              onEscapeKeyDown={keep}
            >
              <DropdownMenuItem>Copy link</DropdownMenuItem>
              <DropdownMenuItem>Email</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PinnedFloaters() {
  return (
    <div className="ov-pins" style={{ gap: 40, minHeight: 160 }}>
      <style>{PIN_CSS}</style>
      <Popover open onOpenChange={noop}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="ov-pin"
            style={pin(0, 150)}
          >
            Popover
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          avoidCollisions={false}
          onOpenAutoFocus={keep}
          onInteractOutside={keep}
          onEscapeKeyDown={keep}
        >
          <PopoverHeader>
            <PopoverTitle>Verify your UGA email</PopoverTitle>
            <PopoverDescription>
              Verified members appear in the directory.
            </PopoverDescription>
          </PopoverHeader>
          <Button size="sm">Send code</Button>
        </PopoverContent>
      </Popover>

      <HoverCard open>
        <HoverCardTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="ov-pin"
            style={pin(280, 110)}
          >
            Hover card
          </Button>
        </HoverCardTrigger>
        <HoverCardContent align="start" side="bottom" avoidCollisions={false}>
          <b style={{ color: "var(--text)" }}>Ava Lin</b>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Computer Science · 9 meetings
          </p>
        </HoverCardContent>
      </HoverCard>

      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="Copy"
              className="ov-pin"
              style={pin(300, 70)}
            >
              <GearIcon weight="bold" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" avoidCollisions={false}>
            Copied!
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="icon-sm" aria-label="Officers">
              <UserCircleIcon weight="bold" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" avoidCollisions={false}>
            Officers only
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function PinnedDialog() {
  return (
    <Stage height={300}>
      {(container) => (
        <Dialog open modal={false} onOpenChange={noop}>
          <DialogContent
            container={container}
            onOpenAutoFocus={keep}
            onInteractOutside={keep}
            onEscapeKeyDown={keep}
          >
            <DialogHeader>
              <DialogTitle>Leave Georgia 311?</DialogTitle>
              <DialogDescription>
                You&apos;ll lose access to the team&apos;s repo and Discord
                channels. Your commits stay.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button variant="destructive" size="sm">
                Leave team
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Stage>
  );
}

function PinnedDrawer({
  side,
  variant,
}: {
  side: "right" | "left" | "top" | "bottom";
  variant?: "drawer" | "panel";
}) {
  const isDrawer = variant ? variant === "drawer" : side === "right";
  return (
    <Stage height={isDrawer ? 560 : 300}>
      {(container) => (
        <Sheet open modal={false} onOpenChange={noop}>
          <SheetContent
            side={side}
            variant={variant}
            container={container}
            onOpenAutoFocus={keep}
            onInteractOutside={keep}
            onEscapeKeyDown={keep}
          >
            <SheetHeader>
              <div>
                <SheetTitle>{isDrawer ? "Edit OAuth app" : "Menu"}</SheetTitle>
                <SheetDescription>
                  {isDrawer
                    ? "Changes apply after you save."
                    : `side="${side}"${variant ? ` variant="${variant}"` : ""} is a plain panel.`}
                </SheetDescription>
              </div>
            </SheetHeader>
            {isDrawer ? (
              <>
                <SheetBody>
                  <SheetSection>Basics</SheetSection>
                  <Input defaultValue="DevDogs Bot" aria-label="Name" />
                  <SheetSection>Redirects</SheetSection>
                  <Input
                    defaultValue="https://example.com/callback"
                    aria-label="Redirect"
                  />
                </SheetBody>
                <SheetFooter>
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                  <Button size="sm">Save changes</Button>
                </SheetFooter>
              </>
            ) : (
              <p className="small muted" style={{ padding: 16, margin: 0 }}>
                Mobile nav and the docs outline slide in this way.
              </p>
            )}
          </SheetContent>
        </Sheet>
      )}
    </Stage>
  );
}

function LiveAlertDialogs() {
  const [typed, setTyped] = useState("");
  return (
    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" size="sm">
            AlertDialog
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this role?</AlertDialogTitle>
            <AlertDialogDescription>
              Members keep their other roles. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger-solid">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" size="sm">
            AlertDialog sm + media
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon weight="bold" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete export?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is removed from the bucket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction variant="danger-solid">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" size="sm">
            Typed confirmation (layout)
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Delete client</AlertDialogTitle>
          <AlertDialogDescription>
            Apps using this client stop signing people in.
          </AlertDialogDescription>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>
              Type <code>my-client</code> to confirm.
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger-solid"
              disabled={typed !== "my-client"}
            >
              Delete client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDestructiveAction
        title="Delete account"
        description="Your profile and attendance are removed."
        action={noop}
        submitLabel="Delete account"
        userConfirmText="delete"
      >
        <Button type="submit" variant="destructive" size="sm">
          ConfirmDestructiveAction (typed)
        </Button>
      </ConfirmDestructiveAction>
    </div>
  );
}

function LiveDialogs() {
  return (
    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            Dialog (modal)
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog</DialogTitle>
            <DialogDescription>
              Escape, the close button and the scrim all dismiss it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <DialogShell
        trigger={
          <Button variant="secondary" size="sm">
            DialogShell
          </Button>
        }
        header={
          <>
            <DialogTitle>Find us</DialogTitle>
            <DialogDescription>
              DLW 124, every Monday at 6:00.
            </DialogDescription>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          The header stays put while the body scrolls.
        </p>
      </DialogShell>

      <DialogShell
        pair="primary"
        trigger={
          <Button variant="secondary" size="sm">
            DialogShell pair
          </Button>
        }
        header={
          <>
            <DialogTitle>Meeting</DialogTitle>
            <DialogDescription>The primary of a pair.</DialogDescription>
          </>
        }
      >
        <DialogShell
          pair="aside"
          trigger={
            <Button size="sm" style={{ justifySelf: "start" }}>
              Open aside
            </Button>
          }
          header={
            <>
              <DialogTitle>Directions</DialogTitle>
              <DialogDescription>Sits beside the primary.</DialogDescription>
            </>
          }
        >
          <p style={{ margin: 0 }}>Beside it from 1024px, stacked below.</p>
        </DialogShell>
      </DialogShell>
    </div>
  );
}

function Toasts() {
  return (
    <>
      <div className="col" style={{ gap: 18, alignItems: "flex-start" }}>
        <Toast id="s" type="success" message="Profile saved" />
        <Toast id="e" type="error" message="Couldn't save. Try again." />
        <Toast id="w" type="warning" message="Verify your UGA email" />
        <Toast id="i" type="info" message="Check-in opens at 5:55" />
        <Toast
          id="l"
          type="success"
          message="A longer message wraps onto a second line so you can see how the icon and the dismiss button hold their places."
        />
      </div>
      <div className="row" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.success("Profile saved")}
        >
          toast.success
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.error("Couldn't save")}
        >
          toast.error
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.warning("Verify your UGA email")}
        >
          toast.warning
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.info("Check-in opens at 5:55")}
        >
          toast.info
        </Button>
      </div>
    </>
  );
}

/**
 * Every state of the live overlay primitives. Overlays that can stay open
 * without trapping the page (non-modal dialog and sheets, menus, popovers,
 * hover cards, tooltips) are pinned open; the modal ones open from a button.
 */
export default function OverlaysSection() {
  return (
    <section className="grp" id="overlays">
      <h2>Overlays</h2>
      <p>
        Menus and dialogs are cards; the scrim darkens the page. Tooltips are
        one line, in the inverse colours, with a hard shadow. Pinned overlays
        are live primitives held open; hover rows and use the keyboard on them.
      </p>
      <div className="pair" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div className="pane cosmic" data-label="Cosmic · DevDogs">
          <Block title="Dialog (pinned, non-modal)">
            <PinnedDialog />
          </Block>
          <Block
            title="Modal dialogs (open from a button)"
            note="AlertDialog focuses Cancel; the typed confirmation keeps its action disabled until the text matches."
          >
            <LiveAlertDialogs />
            <div style={{ height: 12 }} />
            <LiveDialogs />
          </Block>
          <Block title="Drawer, side=right (pinned)">
            <PinnedDrawer side="right" />
          </Block>
          <Block title="Sheet, side=left, plain panel (pinned)">
            <PinnedDrawer side="left" />
          </Block>
          <Block title='Sheet, side=right variant="panel" (the mobile nav)'>
            <PinnedDrawer side="right" variant="panel" />
          </Block>
          <Block title="Sheet, side=top (pinned)">
            <PinnedDrawer side="top" />
          </Block>
          <Block title="Menus: items, label, shortcut, destructive, disabled, checkbox, radio, submenu">
            <PinnedMenus />
          </Block>
          <Block title="Popover, hover card, tooltips">
            <PinnedFloaters />
          </Block>
          <Block title="Toasts">
            <Toasts />
          </Block>
        </div>
      </div>
    </section>
  );
}
