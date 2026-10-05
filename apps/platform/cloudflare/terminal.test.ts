import { describe, expect, it, vi } from "vitest";
import { serveTerminal } from "./terminal";

const CURL = { "user-agent": "curl/8.5.0", accept: "*/*" };

function app(respond: (request: Request) => Response) {
  return vi.fn(async (request: Request) => respond(request));
}

describe("serveTerminal", () => {
  it("lets browsers through", async () => {
    const fetchApp = app(() => new Response("html"));
    const request = new Request("https://devdogsuga.org/events", {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
    });
    expect(await serveTerminal(request, fetchApp)).toBeNull();
    expect(fetchApp).not.toHaveBeenCalled();
  });

  it("forwards known paths to /terminal", async () => {
    const fetchApp = app(
      (request) =>
        new Response(
          new URL(request.url).pathname + new URL(request.url).search,
        ),
    );
    const root = await serveTerminal(
      new Request("https://devdogsuga.org/", { headers: CURL }),
      fetchApp,
    );
    expect(await root!.text()).toBe("/terminal?format=ansi");
    const issue = await serveTerminal(
      new Request("https://devdogsuga.org/changelog/3.0.2?format=txt", {
        headers: CURL,
      }),
      fetchApp,
    );
    expect(await issue!.text()).toBe("/terminal/changelog/3.0.2?format=txt");
  });

  it("passes unknown paths through, and answers their HTML 404s itself", async () => {
    const ics = app(
      () =>
        new Response("BEGIN:VCALENDAR", {
          headers: { "content-type": "text/calendar" },
        }),
    );
    const calendar = await serveTerminal(
      new Request("https://devdogsuga.org/events/calendar.ics", {
        headers: CURL,
      }),
      ics,
    );
    expect(await calendar!.text()).toBe("BEGIN:VCALENDAR");

    const missing = app((request) =>
      new URL(request.url).pathname.startsWith("/terminal")
        ? new Response("terminal 404", { status: 404 })
        : new Response("<html>", {
            status: 404,
            headers: { "content-type": "text/html" },
          }),
    );
    const typo = await serveTerminal(
      new Request("https://devdogsuga.org/changlelog", { headers: CURL }),
      missing,
    );
    expect(await typo!.text()).toBe("terminal 404");
  });

  it("leaves direct /terminal requests to the app", async () => {
    const fetchApp = app(() => new Response("x"));
    expect(
      await serveTerminal(
        new Request("https://devdogsuga.org/terminal/events", {
          headers: CURL,
        }),
        fetchApp,
      ),
    ).toBeNull();
  });
});
