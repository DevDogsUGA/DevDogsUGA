import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddLinkInput from "./AddLinkInput";

/**
 * The bug this guards against was invisible to every behavioural test, because
 * it was made of CSS and jsdom does not apply any.
 *
 * The Add button sits in the same row as the URL input and is disabled until
 * the URL is usable, so on arrival, with an empty box, it is disabled. The row
 * carried `has-disabled:pointer-events-none`, which matches ANY disabled
 * descendant. The button therefore switched off pointer events for the row
 * holding the input you were supposed to type the URL into. The field looked
 * disabled and could not be clicked, and nothing could ever enable it, because
 * enabling it required typing a URL.
 *
 * `fireEvent.change` sets a value directly and never consults pointer-events,
 * which is why driving the component in jsdom reported everything working. So
 * this asserts the class contract instead. The disabled styling has to key on a
 * disabled *input*, never on any disabled descendant.
 */

function renderIdle() {
  return render(
    <AddLinkInput
      urlValue=""
      onUrlChange={vi.fn()}
      titleValue=""
      onTitleChange={vi.fn()}
      onSubmit={vi.fn()}
      submitLabel="Add"
      canSubmit={false}
      disabled={false}
    />,
  );
}

afterEach(() => cleanup());

describe("AddLinkInput", () => {
  it("has a disabled Add button while the URL is unusable", () => {
    renderIdle();
    // The premise of the test below. If this ever stops being true, the
    // has-* selectors are no longer load-bearing and this file should change.
    expect(screen.getByRole("button", { name: /Add/ })).toBeDisabled();
  });

  it("never lets that button disable the field around it", () => {
    const { container } = renderIdle();
    const url = screen.getByLabelText("Link URL");

    for (
      let node: Element | null = url;
      node && node !== container;
      node = node.parentElement
    ) {
      // A blanket `has-disabled:` here is the bug: the disabled Add button is
      // a descendant of these same ancestors.
      expect(node.className).not.toMatch(/(^|\s)has-disabled:/);
    }
  });

  it("still dims and deadens the field when the inputs really are disabled", () => {
    render(
      <AddLinkInput
        urlValue=""
        onUrlChange={vi.fn()}
        titleValue=""
        onTitleChange={vi.fn()}
        onSubmit={vi.fn()}
        submitLabel="Add"
        canSubmit={false}
        disabled
      />,
    );

    const url = screen.getByLabelText("Link URL");
    expect(url).toBeDisabled();

    // `has-[input:disabled]:` matches on this same element, so the styling the
    // scoping removed for the button case still fires for the real one.
    const row = url.closest("[class*='has-\\[input:disabled\\]:']");
    expect(row).not.toBeNull();
  });
});
