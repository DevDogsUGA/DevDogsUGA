import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReflectionActivity } from "~/server/reflections/load";

vi.mock("~/server/actions/reflections", () => ({
  saveReflection: () => Promise.resolve({ ok: true, message: "" }),
}));

const { default: ReflectionCards } = await import("./ReflectionCards");

afterEach(cleanup);

function activity(
  overrides: Partial<ReflectionActivity> = {},
): ReflectionActivity {
  return {
    activityType: "meeting",
    activityId: "11111111-1111-4111-8111-111111111111",
    label: "Workshop night",
    endsAt: new Date("2026-10-20T20:00:00Z"),
    deadline: new Date("2099-01-01T00:00:00Z"),
    reflectionId: null,
    content: "",
    submittedAt: null,
    wordCount: 0,
    canEdit: true,
    workshops: [
      { id: "nextjs", title: "Next.js" },
      { id: "flutter", title: "Flutter" },
    ],
    workshopDefinitionId: null,
    ...overrides,
  };
}

describe("the workshop picker (Q95, Q98)", () => {
  it("offers each workshop the meeting ran, one to pick", () => {
    render(
      <ReflectionCards activities={[activity()]} minimumWordCount={100} />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>(
      /Which workshop did you attend/,
    );
    expect(select.name).toBe("workshopDefinitionId");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Choose a workshop",
      "Next.js",
      "Flutter",
    ]);
    expect(select.value).toBe("");
  });

  it("shows the member's earlier pick", () => {
    render(
      <ReflectionCards
        activities={[activity({ workshopDefinitionId: "flutter" })]}
        minimumWordCount={100}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>(
      /Which workshop did you attend/,
    );
    expect(select.value).toBe("flutter");
  });

  it("sends the only workshop without asking", () => {
    const { container } = render(
      <ReflectionCards
        activities={[
          activity({ workshops: [{ id: "nextjs", title: "Next.js" }] }),
        ]}
        minimumWordCount={100}
      />,
    );
    expect(screen.queryByLabelText(/Which workshop/)).toBeNull();
    const hidden = container.querySelector<HTMLInputElement>(
      'input[name="workshopDefinitionId"]',
    );
    expect(hidden?.value).toBe("nextjs");
  });

  it("locks the pick once the window has closed", () => {
    render(
      <ReflectionCards
        activities={[activity({ canEdit: false })]}
        minimumWordCount={100}
      />,
    );
    expect(
      screen.getByLabelText<HTMLSelectElement>(/Which workshop/).disabled,
    ).toBe(true);
  });
});
