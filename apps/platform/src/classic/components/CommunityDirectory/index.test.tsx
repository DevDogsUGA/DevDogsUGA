import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import CommunityDirectory from ".";

afterEach(cleanup);
it("renders the baseline member cards without post-review controls or academic details", () => {
  render(
    <CommunityDirectory
      officers={[]}
      officerHandles={new Map()}
      members={[
        {
          handle: "ada",
          displayName: "Ada",
          avatarUrl: null,
          bio: "Build things",
          majors: ["Secret major"],
          graduationYear: 2030,
        },
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: /Ada/ })).toHaveAttribute(
    "href",
    "/community/@ada",
  );
  expect(screen.getByText("Build things")).toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByText("Secret major")).toBeNull();
  expect(screen.queryByText("2030")).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
});
