"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDotsIcon,
  DotsThreeIcon,
  GithubLogoIcon,
  GraduationCapIcon,
  NewspaperIcon,
  QuestionIcon,
  UserIcon,
} from "@phosphor-icons/react/ssr";

import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import { Chip } from "~/ui/chip";
import {
  Command,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";
import { DateTile } from "~/ui/date-tile";
import { DefinitionList } from "~/ui/definition-list";
import DropTarget, { DragGrip, ReorderButtons } from "~/ui/drop-target";
import { Kbd } from "~/ui/kbd";
import { ListRow } from "~/ui/list-row";
import ManageableList from "~/ui/manageable-list";
import {
  SelectionBar,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  type SortDirection,
} from "~/ui/table";
import { Timeline, TimelineItem } from "~/ui/timeline";
import {
  TermCursor,
  TermComment,
  TermKeyword,
  TermPrompt,
  TermString,
  TerminalBlock,
} from "~/ui/terminal-block";
import { Avatar, AvatarFallback } from "~/ui/avatar";

function Group({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grp" id={title.toLowerCase().replace(/\W+/g, "-")}>
      <h2>{title}</h2>
      <p dangerouslySetInnerHTML={{ __html: intro }} />
      <div className="pair">
        <div className="pane cosmic" data-label="Cosmic · DevDogs">
          {children}
        </div>
      </div>
    </section>
  );
}

const noop = () => undefined;

const Mark = ({ children }: { children: React.ReactNode }) => (
  <mark>{children}</mark>
);

/** The palette drawn inline (not in a dialog) so every state shows at once. */
function Palette({
  query,
  selected,
  children,
  placeholder = "Search pages, docs, events, help",
}: {
  query: string;
  selected?: string;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <div
      className="dialog cmd-dialog"
      style={{ width: "min(680px, 100%)" }}
      role="group"
      aria-label="Command palette"
    >
      <Command shouldFilter={false} value={selected}>
        <CommandInput
          placeholder={placeholder}
          value={query}
          onValueChange={noop}
          aria-label="Search"
        />
        <CommandList>{children}</CommandList>
        <CommandFooter>
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span>
            <Kbd>↵</Kbd> to open
          </span>
          <span className="end">
            <Kbd>Esc</Kbd> to close
          </span>
        </CommandFooter>
      </Command>
    </div>
  );
}

function Result({
  id,
  icon,
  title,
  sub,
  kind,
  past,
}: {
  id: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  sub: React.ReactNode;
  kind?: string;
  past?: boolean;
}) {
  return (
    <CommandItem value={id} icon={icon} data-kind={kind}>
      <span className="cmd-tx">
        <b>{title}</b>
        <span className="cmd-sub">{sub}</span>
      </span>
      {past ? (
        <Badge>Past</Badge>
      ) : (
        <Kbd className="cmd-go">
          <ArrowRightIcon weight="bold" /> Open
        </Kbd>
      )}
    </CommandItem>
  );
}

const MEMBERS = [
  {
    name: "Ava Lin",
    init: "AL",
    kind: "workshop",
    major: "Computer Science",
    n: 9,
    status: "Verified",
    ok: true,
  },
  {
    name: "Jordan Moss",
    init: "JM",
    kind: "info",
    major: "Data Science",
    n: 6,
    status: "Pending",
    ok: false,
  },
  {
    name: "Riya Kapoor",
    init: "RK",
    kind: "social",
    major: "Cognitive Science",
    n: 4,
    status: "New",
    ok: false,
  },
  {
    name: "Theo Nguyen",
    init: "TP",
    kind: "build",
    major: "Mathematics",
    n: 12,
    status: "Verified",
    ok: true,
  },
] as const;

function DataTables() {
  const [sort, setSort] = useState<{ key: "name" | "n"; dir: SortDirection }>({
    key: "name",
    dir: "ascending",
  });
  const [picked, setPicked] = useState<string[]>(["Jordan Moss"]);
  const rows = [...MEMBERS].sort((a, b) => {
    const v = sort.key === "n" ? a.n - b.n : a.name.localeCompare(b.name);
    return sort.dir === "descending" ? -v : v;
  });
  const toggle = (name: string) =>
    setPicked((p) =>
      p.includes(name) ? p.filter((x) => x !== name) : [...p, name],
    );
  const dirFor = (key: "name" | "n"): SortDirection =>
    sort.key === key ? sort.dir : "none";
  const next = (key: "name" | "n") =>
    setSort((s) => ({
      key,
      dir: s.key === key && s.dir === "ascending" ? "descending" : "ascending",
    }));

  return (
    <>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Plain, with a selected row and a caption
      </div>
      <Table data-kind="build" caption="Members, newest check-in first">
        <THead>
          <Tr>
            <Th>Member</Th>
            <Th>Major</Th>
            <Th num>Meetings</Th>
            <Th>Status</Th>
          </Tr>
        </THead>
        <TBody>
          {MEMBERS.slice(0, 3).map((m, i) => (
            <Tr key={m.name} selected={i === 1}>
              <Td strong>
                <span className="row" style={{ gap: 10 }}>
                  <Avatar size="sm" kind={m.kind}>
                    <AvatarFallback>{m.init}</AvatarFallback>
                  </Avatar>
                  {m.name}
                </span>
              </Td>
              <Td>{m.major}</Td>
              <Td num>{m.n}</Td>
              <Td>
                <Badge
                  variant={m.ok ? "success" : i === 1 ? "warning" : "default"}
                >
                  {m.status}
                </Badge>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="eyebrow" style={{ margin: "28px 0 8px" }}>
        Sortable headers (aria-sort), bulk selection, pinned row menu, 460px
        wide to scroll
      </div>
      <SelectionBar hidden={picked.length === 0}>
        <b>{picked.length} selected</b>
        <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
          Clear
        </Button>
      </SelectionBar>
      <div style={{ maxWidth: 460 }}>
        <Table data-kind="build" caption="Sortable members">
          <THead>
            <Tr>
              <Th>
                <span className="sr-only">Select</span>
              </Th>
              <Th sort={dirFor("name")} onSort={() => next("name")}>
                Member
              </Th>
              <Th>Major</Th>
              <Th num sort={dirFor("n")} onSort={() => next("n")}>
                Meetings
              </Th>
              <Th>Status</Th>
              <Th menu>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((m) => (
              <Tr key={m.name} selected={picked.includes(m.name)}>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${m.name}`}
                    checked={picked.includes(m.name)}
                    onChange={() => toggle(m.name)}
                  />
                </Td>
                <Td strong>{m.name}</Td>
                <Td>{m.major}</Td>
                <Td num>{m.n}</Td>
                <Td>{m.status}</Td>
                <Td menu>
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={`Actions for ${m.name}`}
                  >
                    <DotsThreeIcon weight="bold" />
                  </button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

type Link = { id: string; label: string };

function Sortables() {
  const [items, setItems] = useState<Link[]>([
    { id: "gh", label: "GitHub" },
    { id: "li", label: "LinkedIn" },
    { id: "site", label: "Personal site" },
  ]);
  const [empty, setEmpty] = useState<Link[]>([]);
  const move = (id: string, d: -1 | 1) =>
    setItems((list) => {
      const i = list.findIndex((x) => x.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  return (
    <div className="g2 grid" style={{ gap: 28 }}>
      <div className="col" style={{ gap: 14 }}>
        <div className="eyebrow">ManageableList with onMove</div>
        <ManageableList
          items={items}
          isPending={false}
          error={null}
          onRemove={(id) => setItems((l) => l.filter((x) => x.id !== id))}
          onMove={move}
          renderItem={(item, remove) => (
            <span className="chip" key={item.id} style={{ gap: 10 }}>
              {item.label}
              <button
                type="button"
                className="iconbtn"
                style={{ width: 20, height: 20, fontSize: 12 }}
                aria-label={`Remove ${item.label}`}
                onClick={remove}
              >
                ×
              </button>
            </span>
          )}
          addForm={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setItems((l) => [
                  ...l,
                  { id: `n${l.length}${Date.now()}`, label: "New link" },
                ])
              }
            >
              Add link
            </Button>
          }
        />
        <div className="eyebrow">Plain (wrapping chips), error, empty</div>
        <ManageableList
          items={empty}
          isPending={false}
          error="Couldn't save. Try again."
          onRemove={() => undefined}
          renderItem={() => null}
          emptyLabel="No links yet."
          addForm={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEmpty([{ id: "a", label: "x" }])}
            >
              Add link
            </Button>
          }
        />
      </div>
      <div className="col" style={{ gap: 14 }}>
        <div className="eyebrow">Grip, reorder buttons, drop target</div>
        <div className="arow" style={{ alignItems: "center" }}>
          <DragGrip />
          <div>
            <b>Instagram</b>
            <small>instagram.com/devdogsuga</small>
          </div>
          <ReorderButtons
            label="Instagram"
            onMoveUp={() => undefined}
            onMoveDown={() => undefined}
            canMoveUp={false}
            className="end"
          />
        </div>
        <DropTarget className="h-16 w-full" />
      </div>
    </div>
  );
}

/** Every state of the Command and Data primitives. */
export default function CommandSection() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Group
        title="Command palette"
        intro="The search dialog: a <code>Dialog</code> card with a query field, grouped result rows (icon tile, title, path, <code>Open</code> hint on the selected row), and key hints. Shown inline here; the real one opens from the nav's search control with <kbd>Ctrl</kbd> <kbd>K</kbd>."
      >
        <div className="col" style={{ gap: 28 }}>
          <div className="eyebrow">Results, selected row, past badge</div>
          <Palette query="work" selected="ws2">
            <CommandGroup heading="Pages" count={1}>
              <Result
                id="cl"
                icon={<NewspaperIcon weight="bold" />}
                title={
                  <>
                    Changelog 2.9.0: <Mark>Work</Mark>shop courses in the docs
                  </>
                }
                sub="devdogsuga.org/changelog/2.9.0"
              />
            </CommandGroup>
            <CommandGroup heading="Docs" count={2}>
              <Result
                id="d1"
                icon={<BookOpenIcon weight="bold" />}
                title="Supabase I: Meet the Database"
                sub={
                  <>
                    docs / <Mark>Work</Mark>shops / Web / Step 4
                  </>
                }
              />
              <Result
                id="d2"
                icon={<BookOpenIcon weight="bold" />}
                title="Before you arrive: Next.js"
                sub={
                  <>
                    docs / <Mark>Work</Mark>shops / Web / Before
                  </>
                }
              />
            </CommandGroup>
            <CommandGroup heading="Events" count={2}>
              <Result
                id="ws2"
                kind="workshop"
                icon={<CalendarDotsIcon weight="bold" />}
                title={
                  <>
                    <Mark>Work</Mark>shop Wednesday: Supabase II
                  </>
                }
                sub="Wed, Nov 4 · 6–7 PM · DLW 124"
              />
              <Result
                id="ws1"
                kind="workshop"
                icon={<CalendarDotsIcon weight="bold" />}
                title={
                  <>
                    <Mark>Work</Mark>shop: Career Fair Readiness
                  </>
                }
                sub="Mon, Oct 5 · Past"
                past
              />
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Help answers" count={1}>
              <Result
                id="h1"
                icon={<QuestionIcon weight="bold" />}
                title={
                  <>
                    How do I check in at a <Mark>work</Mark>shop?
                  </>
                }
                sub="Help answer: scan the QR, then type the code"
              />
            </CommandGroup>
          </Palette>

          <div className="eyebrow">Empty query</div>
          <Palette query="">
            <div className="cmd-empty">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src="/cosmic/a/mascot-peek.png" />
              <b>Search DevDogs</b>
              <span>Start typing to find pages, docs, and settings.</span>
            </div>
          </Palette>

          <div className="eyebrow">No results, with a shortcut-style row</div>
          <Palette query="zzzz">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Settings">
              <CommandItem value="s" icon={<UserIcon weight="bold" />}>
                <span className="cmd-tx">
                  <b>Profile</b>
                </span>
                <CommandShortcut>G P</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </Palette>

          <div className="eyebrow">
            Loading (indeterminate bar above the list)
          </div>
          <div className="cmd-progress" aria-hidden style={{ margin: 0 }}>
            <i className="animate-search-progress" />
          </div>
        </div>
      </Group>

      <Group
        title="Data"
        intro="Tables are open: no outer frame, a heavy header rule and light row rules. Key-value lists hold record details. The timeline is the Changelog's. All three are compound components that keep the kit's markup."
      >
        <DataTables />
        <div
          className="g2 grid"
          style={{ marginTop: 28 }}
          data-kind="milestone"
        >
          <DefinitionList
            items={[
              { term: "Meeting", detail: "Merge Monday" },
              { term: "Category", detail: "Build" },
              { term: "Room", detail: "DLW 124" },
              { term: "Checked in", detail: "31 so far" },
            ]}
          />
          <Timeline>
            <TimelineItem>
              <b style={{ color: "var(--text)" }}>3.2.0</b> ·{" "}
              <span className="muted small">Oct 18</span>
              <div className="small">Event buttons in the newsletter</div>
            </TimelineItem>
            <TimelineItem kind="social">
              <b style={{ color: "var(--text)" }}>3.1.0</b> ·{" "}
              <span className="muted small">Oct 4</span>
              <div className="small">Public profiles (a category marker)</div>
            </TimelineItem>
          </Timeline>
        </div>
      </Group>

      <Group
        title="List rows"
        intro="Three shapes of <code>ListRow</code>: <code>verified</code> checklist items, <code>account</code> connections with a trailing action, and <code>meeting</code> rows with a date tile, chip, badges and a caret. Meeting rows collapse to two columns under 720px."
      >
        <div className="col" style={{ gap: 28 }}>
          <div>
            <ListRow
              variant="verified"
              icon={<UserIcon weight="bold" />}
              title="Add your pronouns"
            />
            <ListRow
              variant="verified"
              icon={<GraduationCapIcon weight="bold" />}
              title="Name matches the Involvement Network"
              description="Ava Lin"
            />
            <ListRow
              variant="verified"
              icon={<GithubLogoIcon weight="bold" />}
              title="Link GitHub"
              done={false}
              description="Not yet done: no check"
            />
          </div>
          <div>
            <ListRow
              variant="account"
              icon={<GithubLogoIcon weight="bold" />}
              title="GitHub"
              description="@sloan"
              end={
                <Button variant="outline" size="sm">
                  Disconnect
                </Button>
              }
            />
            <ListRow
              variant="account"
              icon={<GraduationCapIcon weight="bold" />}
              title="UGA email"
              description="Verified"
              end={<Badge variant="success">Verified</Badge>}
            />
          </div>
          <div data-kind="build">
            <ListRow
              variant="meeting"
              kind="build"
              href="#"
              date={
                <DateTile kind="build" weekday="Wed" day={28} month="Oct" />
              }
              title="Georgia 311 Checkpoint"
              chip={<Chip kind="build">Build</Chip>}
              meta="6–7 PM · DLW 124"
            />
            <ListRow
              variant="meeting"
              kind="workshop"
              href="#"
              selected
              date={
                <DateTile kind="workshop" weekday="Wed" day={4} month="Nov" />
              }
              title="Workshop Wednesday: Supabase II"
              chip={<Chip kind="workshop">Workshop</Chip>}
              meta="6–7 PM · DLW 124"
              badges={<Badge variant="success">Counts for credit</Badge>}
            />
            <ListRow
              variant="meeting"
              kind="social"
              href="#"
              past
              date={
                <DateTile kind="social" weekday="Mon" day={19} month="Oct" />
              }
              title="DevDogs Touch Grass #1"
              chip={<Chip kind="social">Social</Chip>}
              meta="Past"
            />
            <ListRow
              variant="meeting"
              kind="info"
              href="#"
              off
              date={<DateTile kind="info" weekday="Fri" day={23} month="Oct" />}
              title="Interest Meeting"
              chip={<Chip kind="info">Info</Chip>}
              meta="Cancelled"
            />
          </div>
        </div>
      </Group>

      <Group
        title="Sortable lists"
        intro="<code>ManageableList</code> keeps its props and gains <code>onMove</code> for keyboard reordering. <code>DragGrip</code> and <code>ReorderButtons</code> are the two handles every sortable row carries, because dragging alone is not reachable from a keyboard. <code>DropTarget</code> holds the place of the row being dragged."
      >
        <Sortables />
      </Group>

      <Group
        title="Disclosure"
        intro="<code>Collapsible disclosure</code> is the docs <code>.dt</code> card on Radix semantics: the trigger is a button with <code>aria-expanded</code>, the caret turns when open. Without <code>disclosure</code> it stays bare, as the sidebar tree and the TOC use it."
      >
        <div className="col" style={{ gap: 12, maxWidth: 560 }}>
          <Collapsible disclosure open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger>
              What happens to my check-in if I leave early?
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p style={{ margin: 0 }}>
                It still counts. Credit comes from the code, not the time you
                stay.
              </p>
              <p style={{ margin: 0 }}>
                Officers can fix a missed one afterwards.
              </p>
            </CollapsibleContent>
          </Collapsible>
          <Collapsible disclosure>
            <CollapsibleTrigger>Closed by default</CollapsibleTrigger>
            <CollapsibleContent>Hidden until opened.</CollapsibleContent>
          </Collapsible>
          <Collapsible>
            <CollapsibleTrigger className="textlink">
              Bare trigger (no disclosure)
            </CollapsibleTrigger>
            <CollapsibleContent>Bare content.</CollapsibleContent>
          </Collapsible>
        </div>
      </Group>

      <Group
        title="Code"
        intro="The terminal voice from the Changelog and the event graphics' link: $ and the command in the context's hue, then a block cursor. It is the one kit surface that keeps a 1px inset outline."
      >
        <div className="col" style={{ gap: 20 }}>
          <TerminalBlock kind="build">
            <TermPrompt>$</TermPrompt> <TermPrompt>pnpm</TermPrompt> dlx
            @devdogsuga/backstage login{"\n"}
            <TermComment># opens devdogsuga.org/oauth/device</TermComment>
            {"\n"}
            <TermString>✓</TermString> Signed in as{" "}
            <TermKeyword>@sloan</TermKeyword>
            {"\n"}
            <TermPrompt>$</TermPrompt> <TermCursor />
          </TerminalBlock>
          <TerminalBlock title={false} kind="workshop">
            <TermPrompt>$</TermPrompt> curl devdogsuga.org/events
          </TerminalBlock>
        </div>
      </Group>
    </>
  );
}
