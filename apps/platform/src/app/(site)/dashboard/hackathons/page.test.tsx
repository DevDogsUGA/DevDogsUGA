import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDashboard: vi.fn(),
  officer: vi.fn(),
  getHackathonsPage: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("~/server/auth/access", () => ({
  requireDashboard: mocks.requireDashboard,
  rules: { officer: mocks.officer },
}));
vi.mock("~/server/hackathons/load", () => ({
  getHackathonsPage: mocks.getHackathonsPage,
}));
vi.mock("~/components/Hackathons/SubmitHackathonForm", () => ({
  SubmitHackathonForm: () => <div data-testid="submit-form" />,
}));
vi.mock("~/components/Hackathons/HackathonDecision", () => ({
  HackathonDecision: ({ id }: { id: string }) => (
    <div data-testid="decision">{id}</div>
  ),
}));

const { default: HackathonsPage, metadata } = await import("./page");

const listed = (over: Record<string, unknown>) => ({
  id: "x",
  name: "Hack",
  url: "https://h.example.com/",
  location: "Online",
  openState: "open",
  dateLabel: null,
  startsOn: null,
  endsOn: null,
  status: "open",
  ...over,
});

const data = (over: Record<string, unknown> = {}) => ({
  current: [
    listed({
      id: "a",
      name: "PayPal AI Hackathon",
      url: "https://paypal.devpost.com/",
      dateLabel: "Oct 01 - Nov 12, 2026",
    }),
  ],
  earlier: [listed({ id: "b", name: "Old Hack", status: "earlier" })],
  mine: [],
  waiting: [],
  syncedAt: new Date("2026-11-01T09:40:00Z"),
  ...over,
});

async function renderPage() {
  render(await HackathonsPage());
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDashboard.mockResolvedValue({ userId: "member-1" });
  mocks.officer.mockReturnValue(false);
  mocks.getHackathonsPage.mockResolvedValue(data());
});
afterEach(cleanup);

describe("/dashboard/hackathons", () => {
  it("is not indexed", () => {
    expect(metadata.robots).toEqual({ index: false });
  });

  it("gates on the dashboard session before reading anything", async () => {
    mocks.requireDashboard.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(HackathonsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getHackathonsPage).not.toHaveBeenCalled();
  });

  it("loads the page for this member, with the officer flag from the rule", async () => {
    mocks.officer.mockReturnValue(true);
    await renderPage();
    expect(mocks.getHackathonsPage).toHaveBeenCalledWith("member-1", true);
  });

  it("lists hackathons as links that open in a new tab, with dates, place and status", async () => {
    await renderPage();
    const link = screen.getByRole("link", { name: "PayPal AI Hackathon" });
    expect(link).toHaveAttribute("href", "https://paypal.devpost.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(
      screen.getByText("Oct 01 - Nov 12, 2026 · Online"),
    ).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Old Hack" })).toBeInTheDocument();
  });

  it("says when Devpost last refreshed, or that it has not yet", async () => {
    await renderPage();
    expect(screen.getByText(/last refreshed Nov 1/u)).toBeInTheDocument();
    cleanup();
    mocks.getHackathonsPage.mockResolvedValue(data({ syncedAt: null }));
    await renderPage();
    expect(
      screen.getByText(/appears after its first refresh/u),
    ).toBeInTheDocument();
  });

  it("shows an empty state when nothing is listed", async () => {
    mocks.getHackathonsPage.mockResolvedValue(
      data({ current: [], earlier: [] }),
    );
    await renderPage();
    expect(screen.getByText("No hackathons listed yet")).toBeInTheDocument();
  });

  it("offers the submit form to every member, and the decision panel only to officers", async () => {
    await renderPage();
    expect(screen.getByTestId("submit-form")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for review")).not.toBeInTheDocument();
    expect(screen.queryByTestId("decision")).not.toBeInTheDocument();
  });

  it("shows the member their own pending and declined submissions with their state", async () => {
    mocks.getHackathonsPage.mockResolvedValue(
      data({
        mine: [
          listed({ id: "m1", name: "My Pending", approval: "pending" }),
          listed({ id: "m2", name: "My Declined", approval: "declined" }),
        ],
      }),
    );
    await renderPage();
    expect(screen.getByText("Your submissions")).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "My Declined" }),
    ).toBeInTheDocument();
  });

  it("omits the member's panel when they have no submissions", async () => {
    await renderPage();
    expect(screen.queryByText("Your submissions")).not.toBeInTheDocument();
  });

  it("gives an officer the waiting submissions, who sent them, and a decision control each", async () => {
    mocks.officer.mockReturnValue(true);
    mocks.getHackathonsPage.mockResolvedValue(
      data({
        waiting: [
          listed({ id: "w1", name: "Waiting Hack", submittedByName: "Ada" }),
          listed({ id: "w2", name: "Anon Hack", submittedByName: null }),
        ],
      }),
    );
    await renderPage();
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.getByText(/Submitted by Ada/u)).toBeInTheDocument();
    expect(screen.getAllByTestId("decision").map((d) => d.textContent)).toEqual(
      ["w1", "w2"],
    );
    expect(screen.queryByText(/Submitted by null/u)).not.toBeInTheDocument();
  });

  it("tells an officer when nothing is waiting", async () => {
    mocks.officer.mockReturnValue(true);
    await renderPage();
    expect(screen.getByText("Nothing waiting for review")).toBeInTheDocument();
  });

  it("anchors each row so an `exists` answer can link to it", async () => {
    await renderPage();
    expect(document.getElementById("hackathon-a")).not.toBeNull();
    expect(document.getElementById("hackathon-b")).not.toBeNull();
  });
});
