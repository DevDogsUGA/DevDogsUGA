import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";

afterEach(() => cleanup());

describe("Collapsible disclosure with asChild", () => {
  it("renders the caret inside the single child, which becomes the trigger", () => {
    render(
      <Collapsible disclosure>
        <CollapsibleTrigger asChild>
          <a href="#more">More</a>
        </CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    const trigger = screen.getByText("More").closest("a") as HTMLElement;
    expect(trigger.dataset.slot).toBe("collapsible-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.querySelector(".dt-caret")).not.toBeNull();
    expect(trigger.firstElementChild?.classList.contains("dt-caret")).toBe(
      true,
    );
    expect(screen.queryByText("Body")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("keeps the caret beside the children without asChild", () => {
    render(
      <Collapsible disclosure>
        <CollapsibleTrigger>More</CollapsibleTrigger>
      </Collapsible>,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    expect(trigger.querySelector(".dt-caret")).not.toBeNull();
  });

  it("adds no caret when the collapsible is bare", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button type="button">More</button>
        </CollapsibleTrigger>
      </Collapsible>,
    );
    expect(document.querySelector(".dt-caret")).toBeNull();
  });
});
