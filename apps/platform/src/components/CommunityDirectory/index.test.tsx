import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DirectoryQuery } from "~/lib/directoryQuery";
import type { DirectoryPage } from "~/server/loaders/publicProfiles";
import CommunityDirectory from ".";

afterEach(cleanup);

const none: DirectoryQuery = {
  q: "",
  leadership: false,
  major: null,
  year: null,
  page: 1,
};
const member = (handle: string, extra = {}) => ({
  handle,
  displayName: `Member ${handle}`,
  avatarUrl: null,
  bio: "A bio",
  graduationYear: null,
  majors: [],
  ...extra,
});
const directory = (over: Partial<DirectoryPage> = {}): DirectoryPage => ({
  members: [member("ada", { majors: ["CS"], graduationYear: 2030 })],
  total: 1,
  page: 1,
  totalPages: 1,
  ...over,
});
const officer = {
  slug: "u1",
  name: "Officer One",
  titles: ["President"],
  imageSrc: null,
} as never;
const facets = { majors: ["CS", "Math"], years: [2029, 2030] };

describe("CommunityDirectory", () => {
  it("shows the board only on the unfiltered first page", () => {
    const { rerender } = render(
      <CommunityDirectory
        officers={[officer]}
        officerHandles={new Map()}
        directory={directory()}
        query={none}
        facets={facets}
      />,
    );
    expect(screen.getByText("Leadership")).toBeTruthy();
    rerender(
      <CommunityDirectory
        officers={[officer]}
        officerHandles={new Map()}
        directory={directory()}
        query={{ ...none, q: "ada" }}
        facets={facets}
      />,
    );
    expect(screen.queryByText("Leadership")).toBeNull();
    expect(screen.getByText("Results")).toBeTruthy();
  });

  it("renders a GET search form carrying the current query", () => {
    render(
      <CommunityDirectory
        officers={[]}
        officerHandles={new Map()}
        directory={directory()}
        query={{
          ...none,
          q: "ada",
          major: "Math",
          year: 2029,
          leadership: true,
        }}
        facets={facets}
      />,
    );
    const form = screen.getByRole("search");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/community");
    const control = <T extends HTMLElement>(label: string) =>
      within(form).getByLabelText<T>(label);
    expect(control<HTMLInputElement>("Name or handle").value).toBe("ada");
    expect(control<HTMLSelectElement>("Major").value).toBe("Math");
    expect(control<HTMLSelectElement>("Graduation year").value).toBe("2029");
    expect(control<HTMLInputElement>("Leadership only").checked).toBe(true);
    expect(
      screen.getByRole("link", { name: "Clear" }).getAttribute("href"),
    ).toBe("/community");
  });

  it("shows major and class year on the card in place of the bio", () => {
    render(
      <CommunityDirectory
        officers={[]}
        officerHandles={new Map()}
        directory={directory()}
        query={none}
        facets={facets}
      />,
    );
    expect(screen.getByText("CS · Class of 2030")).toBeTruthy();
    expect(screen.queryByText("A bio")).toBeNull();
  });

  it("links pages with the query preserved", () => {
    render(
      <CommunityDirectory
        officers={[]}
        officerHandles={new Map()}
        directory={directory({ total: 60, totalPages: 3, page: 2 })}
        query={{ ...none, q: "a", page: 2 }}
        facets={facets}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href"),
    ).toBe("/community?q=a&page=3");
    expect(
      screen.getByRole("link", { name: "Previous page" }).getAttribute("href"),
    ).toBe("/community?q=a");
  });

  it("explains an empty search differently from an empty directory", () => {
    const { rerender } = render(
      <CommunityDirectory
        officers={[]}
        officerHandles={new Map()}
        directory={directory({ members: [], total: 0 })}
        query={{ ...none, q: "zzz" }}
        facets={facets}
      />,
    );
    expect(screen.getByText(/No one matches/)).toBeTruthy();
    rerender(
      <CommunityDirectory
        officers={[]}
        officerHandles={new Map()}
        directory={directory({ members: [], total: 0 })}
        query={none}
        facets={facets}
      />,
    );
    expect(screen.getByText(/No members have made/)).toBeTruthy();
  });
});
