import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import PublicProfile from ".";
import type { PublicProfile as Profile } from "~/server/loaders/publicProfiles";
const profile: Profile = {
  handle: "ada",
  displayName: null,
  avatarUrl: null,
  bio: null,
  roleDescription: null,
  githubHandle: null,
  discordHandle: null,
  linkedinName: null,
  graduationYear: 2030,
  majors: ["Secret major"],
  visibility: { name: false, avatar: false, bio: false, links: false },
};
afterEach(cleanup);
it("shows only the baseline stars card when the privacy-aware loader allows it", () => {
  const { rerender } = render(
    <PublicProfile
      profile={profile}
      activity={{ links: null, stars: { meetingStars: 7 } }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Stars" })).toBeInTheDocument();
  expect(screen.getByText("7")).toBeInTheDocument();
  for (const text of [
    "Badges",
    "Contributions",
    "Streak",
    "Secret major",
    "2030",
  ])
    expect(screen.queryByText(text)).toBeNull();
  rerender(
    <PublicProfile profile={profile} activity={{ links: null, stars: null }} />,
  );
  expect(screen.queryByRole("heading", { name: "Stars" })).toBeNull();
});
