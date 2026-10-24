import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Venue } from "@devdogsuga/events";
import type { Place } from "./place";
import FindUsContent from "./FindUsContent";

// The real map is a lazily loaded 46 KB chunk; what matters here is that the
// content hands it a building only for a mapped one, and that it is hidden.
vi.mock("next/dynamic", () => ({
  default: () =>
    function CampusMapStub({ building }: { building: string }) {
      return <svg aria-hidden data-testid="map" data-building={building} />;
    },
}));

afterEach(() => cleanup());

const place = (
  venue: Venue,
  room: string | null = null,
  joinUrl: string | null = null,
): Place => ({ state: "known", venue, room, joinUrl });

const dlw: Venue = {
  id: "dlw",
  kind: "campus",
  name: "Dining, Learning, and Well-Being Center",
  shortName: "DLW",
  building: "DLW",
  address: "301 E Cloverhurst Ave, Athens, GA 30605",
};

describe("FindUsContent", () => {
  it("campus: map highlighted, aria-hidden, with text and nav links alongside", () => {
    render(<FindUsContent place={place(dlw, "124")} />);
    const map = screen.getByTestId("map");
    expect(map).toHaveAttribute("data-building", "DLW");
    expect(map).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/room 124/)).toBeInTheDocument();
    expect(screen.getByText("Not verified yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Google Maps/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("campus with verified data: shows it with its date and no unverified note", () => {
    render(
      <FindUsContent
        place={place(
          {
            ...dlw,
            verified: {
              verifiedOn: "2026-11-02",
              entrance: "Use the north door.",
              accessibleRoute: "Elevator B to the first floor.",
            },
          },
          "124",
        )}
      />,
    );
    expect(screen.getByText("Use the north door.")).toBeInTheDocument();
    expect(
      screen.getByText("Elevator B to the first floor."),
    ).toBeInTheDocument();
    expect(screen.getByText("November 2, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Not verified yet")).toBeNull();
  });

  it("shows a site floor plan but never a protocol-relative one", () => {
    const withPlan = (floorPlan: string) =>
      place(
        { ...dlw, verified: { verifiedOn: "2026-11-02", floorPlan } },
        "124",
      );
    render(<FindUsContent place={withPlan("/floor-plans/dlw.png")} />);
    expect(screen.getByRole("img", { name: /Floor plan/ })).toHaveAttribute(
      "src",
      "/floor-plans/dlw.png",
    );
    cleanup();
    render(<FindUsContent place={withPlan("//example.com/plan.png")} />);
    expect(screen.queryByRole("img", { name: /Floor plan/ })).toBeNull();
  });

  it("off campus: address and navigation, no map", () => {
    render(
      <FindUsContent
        place={place({
          id: "morehouse-college",
          kind: "offCampus",
          name: "Morehouse College",
          address: "Morehouse College, Atlanta, GA",
          locality: "Atlanta",
        })}
      />,
    );
    expect(screen.queryByTestId("map")).toBeNull();
    expect(
      screen.getByText("Morehouse College, Atlanta, GA"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Apple Maps/ }),
    ).toBeInTheDocument();
  });

  it("virtual: the join link when there is one", () => {
    render(
      <FindUsContent
        place={place(
          { id: "virtual", kind: "virtual", name: "Virtual" },
          null,
          "https://meet.example.org/x",
        )}
      />,
    );
    expect(screen.getByRole("link", { name: /Join online/ })).toHaveAttribute(
      "href",
      "https://meet.example.org/x",
    );
  });

  it("virtual without a link: points at Bevy and the event page", () => {
    render(
      <FindUsContent
        place={place(
          { id: "virtual", kind: "virtual", name: "Virtual" },
          "Bevy (recorded)",
        )}
      />,
    );
    expect(screen.getByText(/Bevy and the event page/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("tba: location pending", () => {
    render(
      <FindUsContent place={place({ id: "tba", kind: "tba", name: "TBA" })} />,
    );
    expect(screen.getByText(/location is pending/)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).toBeNull();
  });

  it("unknown: says so, never the DLW", () => {
    render(<FindUsContent place={{ state: "unknown" }} />);
    expect(screen.getByText(/no record of/)).toBeInTheDocument();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByText(/DLW/)).toBeNull();
  });
});
