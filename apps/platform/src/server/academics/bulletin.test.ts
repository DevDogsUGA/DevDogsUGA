import { describe, expect, it, vi } from "vitest";
import {
  parseBulletinPage,
  scrapeBulletinPrograms,
  type AcademicProgramCategory,
} from "./bulletin";

function pageHtml(options: {
  page: number;
  totalPages: number;
  reportedCount: number;
  programs: {
    id: number;
    name: string;
    credential: string;
    cssClass?: string;
  }[];
}) {
  const cards = options.programs
    .map(
      (program) => `
        <div class="program-card">
          <div class="entry-card--text">
            <p class="large-mw">${program.name}</p>
            <a href="/Program/Details/${program.id}?IDc=ARTS" class="btn btn--outline">
              <span class="${program.cssClass ?? "program-undergrad"}"></span> ${program.credential}
            </a>
          </div>
        </div>`,
    )
    .join("");

  return `
    <p class="small gray mw">${options.reportedCount} results found</p>
    <p class="small gray mw">Page ${options.page}</p>
    ${cards}
    <li class="total">${options.totalPages}</li>`;
}

describe("parseBulletinPage", () => {
  it("keeps separate credentials under one program heading", () => {
    const html = `
      <p class="small gray mw">2 results found</p>
      <p class="small gray mw">Page 1</p>
      <p class="large-mw">Computer Science &amp; Informatics</p>
      <a href="/Program/Details/73962?IDc=ARTS"><span class="program-undergrad"></span> BS</a>
      <a href="/Program/Details/84091?IDc=ARTS"><span class="program-grad"></span> MS</a>
      <li class="total">1</li>`;

    expect(parseBulletinPage(html)).toEqual({
      page: 1,
      totalPages: 1,
      reportedCount: 2,
      programs: [
        {
          id: 73962,
          name: "Computer Science & Informatics",
          credential: "BS",
          category: "undergraduate_major",
          schoolCode: "ARTS",
          bulletinUrl:
            "https://bulletin.uga.edu/Program/Details/73962?IDc=ARTS",
        },
        {
          id: 84091,
          name: "Computer Science & Informatics",
          credential: "MS",
          category: "graduate_major",
          schoolCode: "ARTS",
          bulletinUrl:
            "https://bulletin.uga.edu/Program/Details/84091?IDc=ARTS",
        },
      ],
    });
  });

  it.each<[string, AcademicProgramCategory]>([
    ["program-minor", "undergraduate_minor"],
    ["program-undergradcert", "undergraduate_certificate"],
    ["program-gradcert", "graduate_certificate"],
    ["program-phd", "professional_program"],
  ])("maps %s to %s", (cssClass, category) => {
    const parsed = parseBulletinPage(
      pageHtml({
        page: 1,
        totalPages: 1,
        reportedCount: 1,
        programs: [{ id: 1, name: "Program", credential: "VALUE", cssClass }],
      }),
    );
    expect(parsed.programs[0]?.category).toBe(category);
  });

  it("accepts the Bulletin rows whose detail URL omits a school code", () => {
    const html = `
      <p class="small gray mw">1 results found</p>
      <p class="small gray mw">Page 1</p>
      <p class="large-mw">Graduate Certificate in Infectious Disease Epidemiology</p>
      <a href="/Program/Details/53759"><span class="program-gradcert"></span> CERT-GM</a>
      <li class="total">1</li>`;

    expect(parseBulletinPage(html).programs[0]).toMatchObject({
      id: 53759,
      schoolCode: null,
      bulletinUrl: "https://bulletin.uga.edu/Program/Details/53759",
    });
  });
});

describe("scrapeBulletinPrograms", () => {
  it("paginates sequentially and honors Retry-After", async () => {
    const firstPrograms = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      name: `Program ${index + 1}`,
      credential: "BS",
    }));
    const secondPrograms = Array.from({ length: 250 }, (_, index) => ({
      id: index + 251,
      name: `Program ${index + 251}`,
      credential: "MS",
      cssClass: "program-grad",
    }));
    const responses = [
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "2" },
      }),
      new Response(
        pageHtml({
          page: 1,
          totalPages: 2,
          reportedCount: 500,
          programs: firstPrograms,
        }),
      ),
      new Response(
        pageHtml({
          page: 2,
          totalPages: 2,
          reportedCount: 500,
          programs: secondPrograms,
        }),
      ),
    ];
    const requestedPages: string[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!(init?.body instanceof URLSearchParams)) {
          throw new Error("Expected a URL-encoded request body");
        }
        requestedPages.push(init.body.toString());
        const response = responses.shift();
        if (!response) throw new Error("Unexpected request");
        return response;
      },
    );
    const sleep = vi.fn(async () => undefined);

    const result = await scrapeBulletinPrograms({
      fetch: fetchMock,
      sleep,
      pageDelayMs: 350,
    });

    expect(requestedPages).toEqual([
      "page=1&keyword=",
      "page=1&keyword=",
      "page=2&keyword=",
    ]);
    expect(sleep).toHaveBeenNthCalledWith(1, 2_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 350);
    expect(result).toMatchObject({
      pages: 2,
      requests: 3,
      retries: 1,
    });
    expect(result.programs).toHaveLength(500);
  });

  it("refuses a repeated page before returning partial data", async () => {
    const programs = Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
      name: `Program ${index + 1}`,
      credential: "BS",
    }));
    const html = pageHtml({
      page: 1,
      totalPages: 2,
      reportedCount: 500,
      programs,
    });

    await expect(
      scrapeBulletinPrograms({
        fetch: async () => new Response(html),
        sleep: async () => undefined,
        pageDelayMs: 0,
      }),
    ).rejects.toThrow("returned page 1 when page 2 was requested");
  });
});
