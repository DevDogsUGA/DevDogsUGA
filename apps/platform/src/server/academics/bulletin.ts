const BULLETIN_ORIGIN = "https://bulletin.uga.edu";
const BULLETIN_PROGRAMS_ENDPOINT = `${BULLETIN_ORIGIN}/Program/_ViewAllPrograms`;

const MAX_RESPONSE_BYTES = 1_000_000;
const MIN_EXPECTED_PROGRAMS = 500;
const MAX_ATTEMPTS = 4;

export const BULLETIN_PAGE_DELAY_MS = 350;

export type AcademicProgramCategory =
  | "undergraduate_major"
  | "graduate_major"
  | "undergraduate_minor"
  | "undergraduate_certificate"
  | "graduate_certificate"
  | "professional_program";

export interface BulletinProgram {
  id: number;
  name: string;
  credential: string;
  category: AcademicProgramCategory;
  schoolCode: string | null;
  bulletinUrl: string;
}

export interface ParsedBulletinPage {
  programs: BulletinProgram[];
  page: number;
  totalPages: number;
  reportedCount: number;
}

export interface BulletinScrape {
  programs: BulletinProgram[];
  pages: number;
  requests: number;
  retries: number;
}

interface FetchPageResult {
  parsed: ParsedBulletinPage;
  requests: number;
  retries: number;
}

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

const CATEGORY_BY_CLASS: Record<string, AcademicProgramCategory> = {
  "program-undergrad": "undergraduate_major",
  "program-grad": "graduate_major",
  "program-minor": "undergraduate_minor",
  "program-undergradcert": "undergraduate_certificate",
  "program-gradcert": "graduate_certificate",
  "program-professional": "professional_program",
  // Despite the class name, the Bulletin uses this marker for its PR filter:
  // Law, Medicine, Pharmacy and Veterinary Medicine.
  "program-phd": "professional_program",
};

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number(decimal)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readInteger(html: string, pattern: RegExp, field: string): number {
  const match = pattern.exec(html);
  const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`UGA Bulletin response did not contain a valid ${field}.`);
  }
  return value;
}

/**
 * Parses one HTML partial returned by the Bulletin's paginated program route.
 *
 * This intentionally targets the semantic pieces the page itself needs: a
 * program heading followed by one or more credential links. Parsing a whole
 * `.program-card` with a regular expression would be brittle because the card
 * contains nested divs; slicing between headings keeps each link paired with
 * the name the Bulletin displays above it.
 */
export function parseBulletinPage(html: string): ParsedBulletinPage {
  const page = readInteger(
    html,
    /<p\s+class=["'][^"']*small[^"']*["'][^>]*>\s*Page\s+(\d+)\s*<\/p>/i,
    "page number",
  );
  const totalPages = readInteger(
    html,
    /<li\s+class=["'][^"']*total[^"']*["'][^>]*>\s*(\d+)\s*<\/li>/i,
    "total page count",
  );
  const reportedCount = readInteger(
    html,
    /<p\s+class=["'][^"']*small[^"']*["'][^>]*>\s*(\d+)\s+results found\s*<\/p>/i,
    "result count",
  );

  const headingPattern =
    /<p\s+class=["'][^"']*\blarge-mw\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  const headings = [...html.matchAll(headingPattern)];
  if (headings.length === 0) {
    throw new Error(`UGA Bulletin page ${page} contained no program headings.`);
  }

  const programs: BulletinProgram[] = [];
  const linkPattern =
    /<a\b[^>]*href=["'](\/Program\/Details\/(\d+)(?:\?IDc=([^&"']+)[^"']*)?)["'][^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*\b(program-[a-z]+)\b[^"']*["'][^>]*><\/span>\s*([^<]*?)\s*<\/a>/gi;

  for (const [index, heading] of headings.entries()) {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const segment = html.slice(start, end);
    const name = decodeHtml(heading[1] ?? "");
    let credentialsForHeading = 0;

    for (const link of segment.matchAll(linkPattern)) {
      const bulletinPath = link[1] ?? "";
      const id = Number.parseInt(link[2] ?? "", 10);
      const schoolCode = link[3] ? decodeURIComponent(link[3]) : null;
      const cssClass = link[4] ?? "";
      const category = CATEGORY_BY_CLASS[cssClass];
      const credential = decodeHtml(link[5] ?? "");

      if (!category) {
        throw new Error(
          `UGA Bulletin program ${id} uses an unknown category class: ${cssClass}.`,
        );
      }
      if (!Number.isInteger(id) || id < 1 || !name || !credential) {
        throw new Error(
          `UGA Bulletin page ${page} contained a malformed program link.`,
        );
      }

      programs.push({
        id,
        name,
        credential,
        category,
        schoolCode,
        bulletinUrl: `${BULLETIN_ORIGIN}${bulletinPath}`,
      });
      credentialsForHeading += 1;
    }

    if (credentialsForHeading === 0) {
      const hrefs = [...segment.matchAll(/href=["']([^"']+)["']/gi)]
        .map((match) => match[1])
        .filter(Boolean)
        .slice(0, 5);
      throw new Error(
        `UGA Bulletin page ${page} program "${name}" contained no recognized credential link (${hrefs.join(", ") || "no links"}).`,
      );
    }
  }

  if (programs.length === 0) {
    throw new Error(`UGA Bulletin page ${page} contained no credential links.`);
  }

  return { programs, page, totalPages, reportedCount };
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("UGA Bulletin response exceeded the size limit.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("UGA Bulletin response exceeded the size limit.");
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 60_000);
    }

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(date - Date.now(), 0), 60_000);
    }
  }

  return 1_000 * 2 ** (attempt - 1);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchPage(
  page: number,
  fetchImpl: FetchLike,
  sleep: Sleep,
): Promise<FetchPageResult> {
  let requests = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response | null = null;
    requests += 1;

    try {
      response = await fetchImpl(BULLETIN_PROGRAMS_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "text/html",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent":
            "DevDogsUGA-AcademicProgramSync/1.0 (+https://devdogsuga.org)",
        },
        body: new URLSearchParams({ page: String(page), keyword: "" }),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const parsed = parseBulletinPage(await readBoundedText(response));
        if (parsed.page !== page) {
          throw new Error(
            `UGA Bulletin returned page ${parsed.page} when page ${page} was requested.`,
          );
        }
        return { parsed, requests, retries: requests - 1 };
      }

      lastError = new Error(
        `UGA Bulletin page ${page} returned HTTP ${response.status}.`,
      );
      if (!isRetryableStatus(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
      if (response && !isRetryableStatus(response.status)) throw error;
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(retryDelay(response, attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`UGA Bulletin page ${page} could not be fetched.`);
}

/**
 * Fetches every Bulletin page sequentially. A 350ms inter-page pause keeps the
 * once-daily sync below three requests per second, while Retry-After and
 * exponential backoff handle an explicit rate-limit response. Nothing is
 * returned until every page validates, allowing the caller to update the
 * database as one all-or-nothing operation.
 */
export async function scrapeBulletinPrograms(options?: {
  fetch?: FetchLike;
  sleep?: Sleep;
  pageDelayMs?: number;
}): Promise<BulletinScrape> {
  const fetchImpl = options?.fetch ?? fetch;
  const sleep =
    options?.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pageDelayMs = options?.pageDelayMs ?? BULLETIN_PAGE_DELAY_MS;

  const first = await fetchPage(1, fetchImpl, sleep);
  const byId = new Map<number, BulletinProgram>();
  let requests = first.requests;
  let retries = first.retries;

  for (const program of first.parsed.programs) byId.set(program.id, program);

  for (let page = 2; page <= first.parsed.totalPages; page += 1) {
    await sleep(pageDelayMs);
    const result = await fetchPage(page, fetchImpl, sleep);
    requests += result.requests;
    retries += result.retries;

    if (
      result.parsed.totalPages !== first.parsed.totalPages ||
      result.parsed.reportedCount !== first.parsed.reportedCount
    ) {
      throw new Error(
        "UGA Bulletin pagination totals changed during the scrape.",
      );
    }

    for (const program of result.parsed.programs) {
      if (byId.has(program.id)) {
        throw new Error(
          `UGA Bulletin program ${program.id} appeared on more than one page.`,
        );
      }
      byId.set(program.id, program);
    }
  }

  if (byId.size !== first.parsed.reportedCount) {
    throw new Error(
      `UGA Bulletin reported ${first.parsed.reportedCount} programs but ${byId.size} were parsed.`,
    );
  }
  if (byId.size < MIN_EXPECTED_PROGRAMS) {
    throw new Error(
      `UGA Bulletin returned only ${byId.size} programs; refusing a suspiciously small sync.`,
    );
  }

  return {
    programs: [...byId.values()].sort((a, b) => a.id - b.id),
    pages: first.parsed.totalPages,
    requests,
    retries,
  };
}
