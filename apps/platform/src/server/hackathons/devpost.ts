/**
 * The Devpost adapter: one page of the public hackathon feed, validated and
 * mapped to what the `hackathons` table stores (D0 section 5).
 *
 * The endpoint is undocumented, so nothing here trusts it. A page is read
 * under a time and size limit; its items are validated one by one and an item
 * that does not match is dropped, never repaired; and the filters in the
 * request (online, open or upcoming) are checked again locally because they
 * may change without notice. Every failure comes back as a typed result: only
 * a programming error throws. Pagination and storage are the sync's
 * (`./sync`), which is why this module has neither.
 */
import { z } from "zod";
import { canonicalHttpsUrl } from "./url";

export const DEVPOST_ENDPOINT = "https://devpost.com/api/hackathons";

/** Bytes one page may be, read or not. A real page is about ten kilobytes. */
export const MAX_BODY_BYTES = 512 * 1024;
export const REQUEST_TIMEOUT_MS = 10_000;

const NAME_MAX = 200;
const LOCATION_MAX = 200;
const LABEL_MAX = 200;

/** A hackathon as the table stores it. Always online and open or upcoming. */
export type DevpostHackathon = {
  devpostId: number;
  name: string;
  url: string;
  location: string;
  openState: "open" | "upcoming";
  /** Devpost's own words for the submission period; shown as given. */
  dateLabel: string | null;
  /** ISO days, only when the label parses without a guess. */
  startsOn: string | null;
  endsOn: string | null;
};

/**
 * One page, after validation. The ids are every item's id (even an item that
 * was dropped or skipped) so the sync can tell when a feed has repeated
 * itself; `idless` counts the items that had none.
 */
export type DevpostPage = {
  items: DevpostHackathon[];
  totalCount: number;
  ids: number[];
  idless: number;
  /** Items whose shape did not match, or whose link or title was unusable. */
  dropped: number;
  /** Well-formed items that are not online and open or upcoming. */
  skipped: number;
};

export type DevpostFailure = {
  /**
   * `rate`: 429, or a 403 (Devpost answers a block that way). `http`: any
   * other status. `network`: no answer, or a timeout. `size`: the body went
   * past `MAX_BODY_BYTES`. `shape`: not JSON, or not the envelope we know.
   */
  kind: "rate" | "http" | "network" | "size" | "shape";
  message: string;
  /** When the next attempt is reasonable, if the server said. */
  retryAt?: Date;
};
export type DevpostResult<T> =
  { ok: true; data: T } | ({ ok: false } & DevpostFailure);

const fail = (
  kind: DevpostFailure["kind"],
  message: string,
  retryAt?: Date,
): { ok: false } & DevpostFailure => ({ ok: false, kind, message, retryAt });

/** What an item must have. Everything else Devpost sends is ignored. */
const itemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  open_state: z.string(),
  displayed_location: z.object({
    location: z.string(),
    icon: z.string().nullish(),
  }),
  submission_period_dates: z.string().nullish(),
});
const envelopeSchema = z.object({
  hackathons: z.array(z.unknown()),
  meta: z.object({ total_count: z.number().int().nonnegative() }),
});

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** A real calendar day as `YYYY-MM-DD`, or null (`Feb 30` is not one). */
function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString().slice(0, 10);
}

const MON = "([A-Za-z]{3})";
const DAY = "(\\d{1,2})";
const YEAR = "(\\d{4})";
/** The label shapes Devpost has been seen to use; anything else is not parsed. */
const LABELS: {
  pattern: RegExp;
  read: (m: RegExpExecArray) => [string | null, string | null];
}[] = [
  {
    // "Oct 01 - Nov 12, 2026": the year belongs to both ends. If the start
    // would then fall after the end the range crosses a year, and which
    // year the start is in is a guess.
    pattern: new RegExp(`^${MON} ${DAY} - ${MON} ${DAY}, ${YEAR}$`, "u"),
    read: (m) => {
      const [startMonth, endMonth] = [m[1]!, m[3]!].map(
        (name) => MONTHS[name.toLowerCase()],
      );
      if (!startMonth || !endMonth || startMonth > endMonth)
        return [null, null];
      const year = Number(m[5]);
      return [
        isoDay(year, startMonth, Number(m[2])),
        isoDay(year, endMonth, Number(m[4])),
      ];
    },
  },
  {
    // "Nov 02 - 04, 2026": one month.
    pattern: new RegExp(`^${MON} ${DAY} - ${DAY}, ${YEAR}$`, "u"),
    read: (m) => {
      const month = MONTHS[m[1]!.toLowerCase()];
      if (!month) return [null, null];
      const year = Number(m[4]);
      return [
        isoDay(year, month, Number(m[2])),
        isoDay(year, month, Number(m[3])),
      ];
    },
  },
  {
    // "Dec 28, 2026 - Jan 05, 2027": both years are written out.
    pattern: new RegExp(
      `^${MON} ${DAY}, ${YEAR} - ${MON} ${DAY}, ${YEAR}$`,
      "u",
    ),
    read: (m) => {
      const [startMonth, endMonth] = [m[1]!, m[4]!].map(
        (name) => MONTHS[name.toLowerCase()],
      );
      if (!startMonth || !endMonth) return [null, null];
      return [
        isoDay(Number(m[3]), startMonth, Number(m[2])),
        isoDay(Number(m[6]), endMonth, Number(m[5])),
      ];
    },
  },
  {
    // "Nov 02, 2026": a single day.
    pattern: new RegExp(`^${MON} ${DAY}, ${YEAR}$`, "u"),
    read: (m) => {
      const month = MONTHS[m[1]!.toLowerCase()];
      const day = month ? isoDay(Number(m[3]), month, Number(m[2])) : null;
      return [day, day];
    },
  },
];

/**
 * The days a submission-period label names, only when it names them
 * unambiguously: both ends parse as real dates and are in order. A label this
 * does not recognise, a missing year, a range that would have to cross a year
 * to make sense, or a localised month all give `[null, null]`, and the caller
 * keeps the label as given. A date is never synthesized from a guess, and no
 * time or time zone is ever invented.
 */
export function parseDateLabel(
  label: string | null | undefined,
): [string | null, string | null] {
  const text = label?.trim().replace(/\s+/gu, " ");
  if (!text) return [null, null];
  for (const { pattern, read } of LABELS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [start, end] = read(match);
    if (start === null || end === null || start > end) return [null, null];
    return [start, end];
  }
  return [null, null];
}

type RawItem = z.infer<typeof itemSchema>;

/** The online flag Devpost puts in a location, never in a field of its own. */
function isOnline(item: RawItem): boolean {
  return (
    item.displayed_location.icon === "globe" ||
    /^online\b/iu.test(item.displayed_location.location.trim())
  );
}

/**
 * One item as a table row, `"skip"` for a well-formed item that is not ours
 * (in person, or not open or upcoming), or `null` when its shape is wrong.
 */
function mapItem(raw: unknown): DevpostHackathon | "skip" | null {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const name = item.title
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, NAME_MAX)
    .trim();
  const url = canonicalHttpsUrl(item.url);
  if (name.length < 2 || url === null) return null;
  if (!isOnline(item)) return "skip";
  if (item.open_state !== "open" && item.open_state !== "upcoming")
    return "skip";
  const label = item.submission_period_dates?.trim().slice(0, LABEL_MAX) ?? "";
  const [startsOn, endsOn] = parseDateLabel(label);
  return {
    devpostId: item.id,
    name,
    url,
    location: item.displayed_location.location.trim().slice(0, LOCATION_MAX),
    openState: item.open_state,
    dateLabel: label === "" ? null : label,
    startsOn,
    endsOn,
  };
}

/**
 * Validates a decoded response body. A body that is not the envelope (a
 * `hackathons` array and a `meta.total_count`) is a `shape` failure. A page
 * that has items and not one of them is usable is one too: that is the
 * signature of a changed schema, and treating it as an empty page would end
 * the cycle as a success.
 */
export function parseDevpostPage(body: unknown): DevpostResult<DevpostPage> {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success)
    return fail("shape", "The response is not the hackathon list envelope.");
  const page: DevpostPage = {
    items: [],
    totalCount: envelope.data.meta.total_count,
    ids: [],
    idless: 0,
    dropped: 0,
    skipped: 0,
  };
  for (const raw of envelope.data.hackathons) {
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id === "number" && Number.isInteger(id) && id > 0)
      page.ids.push(id);
    else page.idless += 1;
    const mapped = mapItem(raw);
    if (mapped === null) page.dropped += 1;
    else if (mapped === "skip") page.skipped += 1;
    else page.items.push(mapped);
  }
  const received = envelope.data.hackathons.length;
  if (received > 0 && page.dropped === received)
    return fail("shape", `All ${received} items on the page were unreadable.`);
  return { ok: true, data: page };
}

/** The body as text, or `null` once it passes `maxBytes`, without reading the rest. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) {
    const text = await response.text();
    return text.length > maxBytes ? null : text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** `Retry-After` as a time, in seconds or as a date; unreadable is `undefined`. */
function retryAfter(response: Response): Date | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0)
    return new Date(Date.now() + seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : new Date(date);
}

export type FetchOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

/**
 * Page `page` (from 1) of the online, open and upcoming hackathons: one
 * request, read under `timeoutMs` and `maxBytes`, then validated.
 */
export async function fetchDevpostPage(
  page: number,
  options: FetchOptions = {},
): Promise<DevpostResult<DevpostPage>> {
  const {
    fetch: doFetch = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxBytes = MAX_BODY_BYTES,
  } = options;
  const url = `${DEVPOST_ENDPOINT}?challenge_type[]=online&status[]=upcoming&status[]=open&page=${page}`;
  let response: Response;
  let text: string | null;
  try {
    response = await doFetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DevDogsUGA-platform (+https://devdogsuga.org)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return response.status === 429 || response.status === 403
        ? fail(
            "rate",
            `Devpost answered ${response.status}.`,
            retryAfter(response),
          )
        : fail("http", `Devpost answered ${response.status}.`);
    }
    text = await readCapped(response, maxBytes);
  } catch (error) {
    return fail(
      "network",
      error instanceof Error ? error.message : "The request failed.",
    );
  }
  if (text === null)
    return fail("size", `The response is over ${maxBytes} bytes.`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("shape", "The response is not JSON.");
  }
  return parseDevpostPage(body);
}
