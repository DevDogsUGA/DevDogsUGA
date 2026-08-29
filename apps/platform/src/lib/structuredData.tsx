import { SOCIAL_LINKS, SWITCHER_LINKS } from "~/config/nav";
import { env } from "~/env";

/**
 * schema.org JSON-LD, and the one component allowed to put it in the document.
 *
 * The builders and the serializer live in the same file on purpose. The only
 * thing that can go badly wrong with JSON-LD is the embedding — a `</script>`
 * inside a string ends the block early and turns the rest of the payload into
 * markup — and keeping `<JsonLd>` beside the shapes means there is no second
 * way to emit one that could skip the escaping below.
 *
 * The rule for what goes in these objects is that every field has to be
 * answerable from something this app actually stores or states elsewhere.
 * Nothing here is inferred, rounded, or filled in to satisfy a rich-result
 * checklist: a structured-data claim that drifts from the page is worse than an
 * absent one, because it is the version a search engine believes.
 */

/**
 * Same treatment `sitemap.ts` gives it, for the same reason: these `@id` and
 * `url` values are absolute and must not double a slash.
 */
const BASE = env.BASE_URL.replace(/\/$/, "");

/**
 * The club's own description, as `app/layout.tsx` states it. Written out rather
 * than imported for the same reason `manifest.ts` writes it out — a metadata
 * module reaching into the root layout's `metadata` export is a dependency
 * nobody intends. Keep the three in step.
 */
const DESCRIPTION =
  "DevDogs is a club at UGA devoted to bettering our community through " +
  "open-source software.";

/**
 * Stable node identities, so the two nodes on the homepage can reference each
 * other instead of restating themselves. The `#fragment` convention is what
 * schema.org consumers expect for a node that is *about* a URL rather than
 * located at one.
 */
const ORGANIZATION_ID = `${BASE}/#organization`;
const WEBSITE_ID = `${BASE}/#website`;

/**
 * `sameAs` wants pages that unambiguously identify the same organization, which
 * is exactly what `config/nav.ts` already curates: the club's social profiles
 * and its two official campus listings. Deriving them rather than retyping them
 * means a channel the club adds to the navbar reaches its structured data too.
 *
 * The `mailto:` entry is filtered out and fed to `email` instead — it names a
 * way to reach the club, not a page that identifies it.
 */
const MAILTO = "mailto:";

const sameAs = [...SOCIAL_LINKS, ...SWITCHER_LINKS]
  .map((link) => link.href)
  .filter((href) => !href.startsWith(MAILTO));

const email = SOCIAL_LINKS.find((link) =>
  link.href.startsWith(MAILTO),
)?.href.slice(MAILTO.length);

/**
 * The two site-wide nodes, as one `@graph` — Organization and WebSite.
 *
 * There is deliberately no `potentialAction: SearchAction`. The app does have a
 * `/search` endpoint, but it is a JSON route handler behind the command
 * palette: there is no URL that lands a person on a page of results, and a
 * SearchAction naming one that does not exist is a broken promise a search
 * engine may surface as a sitelinks search box.
 */
export function siteGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "DevDogs",
        url: BASE,
        description: DESCRIPTION,
        // `app/icon.png`, the club's mark — the same file the favicon and the
        // manifest icon are served from, so there is one image to keep current.
        logo: `${BASE}/icon.png`,
        ...(email ? { email } : {}),
        sameAs,
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: BASE,
        name: "DevDogs",
        description: DESCRIPTION,
        // `<html lang="en">` in the root layout; this is that statement, in the
        // vocabulary a crawler reads.
        inLanguage: "en",
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

export interface EventLdInput {
  slug: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  /** An officer's blurb, when one was written. */
  summary: string | null;
  /** `locationLine(building, location)` — null when neither is known. */
  where: string | null;
  /**
   * When the club called the night off, or null.
   *
   * A cancelled meeting keeps its URL and its row, so this cannot be inferred
   * from the page existing — see `eventStatus` below.
   */
  cancelledAt: Date | null;
}

/**
 * One meeting, as `Event`.
 *
 * `startDate`/`endDate` go out as UTC instants rather than as wall-clock
 * strings. The club's own pages render every time in `EVENT_TZ`, but an
 * offsetless local time in JSON-LD is read as the *reader's* zone, which puts a
 * Thursday evening in Athens on Friday morning for anybody east of it. The
 * instant is unambiguous and every consumer converts it back.
 *
 * `location` and `eventAttendanceMode` are emitted as a pair or not at all. The
 * mode is a claim about how somebody attends, and asserting "offline" with no
 * place to go is the sort of half-answer that produces a rich result reading
 * "Location: —". `where` is the same string the page itself prints, so the two
 * cannot disagree; the buildings table carries no street addresses, so the
 * Place has a name and nothing else.
 */
export function eventLd(meeting: EventLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: meeting.name,
    url: `${BASE}/events/${encodeURIComponent(meeting.slug)}`,
    startDate: meeting.startsAt.toISOString(),
    endDate: meeting.endsAt.toISOString(),
    // Read from the column rather than assumed. This used to be hardcoded to
    // `EventScheduled` on the premise that a cancelled meeting was soft
    // deleted in Airtable and 404ed before rendering — which stopped being
    // true when cancellation became a column and the night kept its page. A
    // crawler was then told a cancelled meeting was going ahead, which is the
    // one thing `eventStatus` exists to prevent.
    eventStatus:
      meeting.cancelledAt === null
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventCancelled",
    ...(meeting.summary ? { description: meeting.summary } : {}),
    ...(meeting.where
      ? {
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: { "@type": "Place", name: meeting.where },
        }
      : {}),
    organizer: {
      "@type": "Organization",
      // Spelled out rather than referenced by `@id`: the Organization node
      // lives on the homepage, and a bare `@id` pointing at a node that is not
      // in THIS document resolves to nothing.
      name: "DevDogs",
      url: BASE,
    },
  };
}

/**
 * The escaping that makes the embedding safe.
 *
 * `JSON.stringify` escapes quotes and backslashes but leaves `<` alone, and an
 * HTML parser ends a `<script>` block at the first literal `</script>` wherever
 * it appears — including inside a string. Rewriting every `<` as the JSON
 * escape sequence for it parses back to the same character, so the payload is
 * unchanged and the sequence can no longer exist in the markup.
 *
 * Every string in these objects comes from a database column an officer edits
 * (a meeting's name, its summary), so this is the actual attack surface rather
 * than a formality.
 */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Renders one JSON-LD block. Server components only — `env` is read above. */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}
