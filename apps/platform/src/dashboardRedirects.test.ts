// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  matchRedirect,
  preserveRedirectDestinationQuery,
  requestContextFromRequest,
} from "../node_modules/vinext/dist/config/config-matchers.js";
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", BASE_URL: "https://devdogsuga.org" },
}));
import config from "../next.config";
import robots from "./app/robots";

/** Exercise the installed vinext matcher, including query preservation. */
describe("permanent dashboard redirects", async () => {
  const redirects = await config.redirects();
  it.each([
    ["/settings", "/dashboard/profile"],
    ["/settings/oauth/new", "/dashboard/oauth/new"],
    ["/console", "/dashboard"],
    ["/console/attendance/a/present", "/dashboard/meetings/a/present"],
    ["/console/meetings/meeting/new", "/dashboard/schedule/meeting/new"],
    ["/console/projects", "/dashboard/reviews"],
    ["/console/projects/a", "/dashboard/projects/a"],
    ["/dashboard/reviews/a", "/dashboard/projects/a"],
    ["/console/data/imports/preview", "/dashboard/data/imports/preview"],
    ["/projects", "/dashboard/projects"],
    ["/projects/a/report", "/dashboard/projects/a/report"],
    ["/attendance", "/dashboard/attendance"],
    ["/account", "/dashboard/profile"],
    ["/account/deletion", "/dashboard/deletion"],
    ["/preview/docs/platform/guide", "/dashboard/docs-preview/platform/guide"],
    ["/tools/oauth", "/dashboard/oauth"],
  ])("%s permanently redirects to %s with the query intact", (from, to) => {
    const request = new Request(
      `https://devdogsuga.org${from}?x=1&x=2&return=%2Fevents`,
    );
    const result = matchRedirect(
      from,
      redirects,
      requestContextFromRequest(request),
    );
    expect(result).toEqual({ destination: to, permanent: true });
    expect(
      preserveRedirectDestinationQuery(
        result!.destination,
        new URL(request.url).search,
      ),
    ).toBe(`${to}?x=1&x=2&return=%2Fevents`);
  });
  it("disallows the dashboard, OAuth flows and legacy redirect prefixes", () => {
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(false);
    if (Array.isArray(rules)) throw new Error("expected one robots rule");
    for (const path of ["/dashboard", "/oauth", "/console", "/settings"])
      expect(rules.disallow).toContain(path);
  });
  it("leaves public project detail URLs alone", () => {
    const request = new Request("https://devdogsuga.org/projects/a");
    expect(
      matchRedirect(
        "/projects/a",
        redirects,
        requestContextFromRequest(request),
      ),
    ).toBeNull();
  });
});
