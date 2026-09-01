import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpenOrShareDialog from "./OpenOrShareDialog";

afterEach(() => cleanup());

describe("OpenOrShareDialog", () => {
  it("renders a relative route that redirects off-site", () => {
    render(
      <OpenOrShareDialog
        title="Leadership Team Application"
        url="/leadership"
        external
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText("This link opens outside this site."),
    ).toBeInTheDocument();
  });

  it("names the host for an absolute external URL", () => {
    render(
      <OpenOrShareDialog
        title="Involvement Network"
        url="https://uga.campuslabs.com/engage/organization/devdogs"
        external
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText("This link goes to uga.campuslabs.com."),
    ).toBeInTheDocument();
  });
});
