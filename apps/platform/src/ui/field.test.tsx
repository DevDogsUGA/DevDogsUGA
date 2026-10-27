import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";
import Field from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

afterEach(() => cleanup());

const ids = (el: HTMLElement) =>
  (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);

describe("Field", () => {
  it("points the control at the help and error text", () => {
    render(
      <Field label="Email" description="We never share it" error="Bad address">
        <Input aria-label="Email address" />
      </Field>,
    );
    const input = screen.getByLabelText("Email address");
    const [help, err] = ids(input);
    expect(document.getElementById(help ?? "")?.textContent).toBe(
      "We never share it",
    );
    expect(document.getElementById(err ?? "")?.getAttribute("role")).toBe(
      "alert",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps a caller-supplied aria-describedby and aria-invalid", () => {
    render(
      <Field label="Bio" description="Short" error="Too long">
        <Textarea
          aria-label="Bio text"
          aria-describedby="mine"
          aria-invalid={false}
        />
      </Field>,
    );
    const area = screen.getByLabelText("Bio text");
    expect(ids(area)[0]).toBe("mine");
    expect(ids(area)).toHaveLength(3);
    expect(area.getAttribute("aria-invalid")).toBe("false");
  });

  it("adds nothing without help or error, or outside a Field", () => {
    render(
      <>
        <Field label="Name">
          <Input aria-label="Name field" />
        </Field>
        <Input aria-label="Loose" />
      </>,
    );
    expect(
      screen.getByLabelText("Name field").hasAttribute("aria-describedby"),
    ).toBe(false);
    expect(
      screen.getByLabelText("Loose").hasAttribute("aria-describedby"),
    ).toBe(false);
  });
});

describe("Checkbox indeterminate", () => {
  it("is mixed through the native indeterminate flag, and clears when not set", () => {
    const { rerender } = render(<Checkbox indeterminate label="All" />);
    const box = screen.getByLabelText<HTMLInputElement>("All");
    expect(box.indeterminate).toBe(true);
    expect(box.hasAttribute("aria-checked")).toBe(false);
    rerender(<Checkbox label="All" />);
    expect(box.indeterminate).toBe(false);
    expect(box.hasAttribute("aria-checked")).toBe(false);
  });
});
