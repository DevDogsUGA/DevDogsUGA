// Loaded at runtime by the shared react preset's `setupFiles`; imported here
// as well so `tsc` sees the `expect` augmentation. Without it the matchers work
// but `toBeInTheDocument` is a type error.
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReportDialog from "./ReportDialog";
import type { ModerationClient } from "./rpc";

/**
 * These pin the **wire shape**, which RPC is called with which argument names.
 * Not the SQL behaviour, which lives in the persona suite under
 * `packages/supabase/testing`.
 *
 * `callRpc` is typed against the generated `Database["platform"]["Functions"]`,
 * but the types only catch a *wrong* name, not a right name carrying the wrong
 * value: passing `contentRef` where `content_ref` was meant is a type error,
 * but passing the content ref as `reason` is not. These assert the mapping
 * itself.
 *
 * They also cover the one behaviour the shape does not imply: a corroborated
 * report and a fresh one are the same successful response, and the dialog has
 * to say different things about them.
 */

/**
 * A client whose every RPC is answered from a map.
 *
 * An entry may be a value (resolves) or an `Error` (resolves with PostgREST's
 * `{ data, error }` envelope, which is how a raised exception arrives, not as a
 * rejected promise).
 */
function stubClient(responses: Record<string, unknown>) {
  const rpc = vi.fn((fn: string) => {
    const answer = responses[fn];
    return Promise.resolve(
      answer instanceof Error
        ? { data: null, error: { message: answer.message } }
        : { data: answer ?? null, error: null },
    );
  });
  const schema = vi.fn().mockReturnValue({ rpc });
  return { client: { schema } as unknown as ModerationClient, rpc, schema };
}

/** The option element for a reason, once the list has loaded. */
function reasonOption(title: string) {
  return screen.findByRole("option", { name: title });
}

const REASONS = [
  { reason: "spam", title: "Spam", description: "Unsolicited promotion" },
];

function renderDialog(client: ModerationClient) {
  return render(
    <ReportDialog
      open
      onOpenChange={() => undefined}
      client={client}
      app="forum"
      contentType="resource"
      contentRef="resource-42"
    />,
  );
}

describe("ReportDialog", () => {
  it("hops to the platform schema whatever the caller's client defaults to", async () => {
    const { client, schema } = stubClient({ list_report_reasons: REASONS });
    renderDialog(client);

    await waitFor(() => expect(schema).toHaveBeenCalledWith("platform"));
  });

  it("loads reasons through list_report_reasons", async () => {
    const { client, rpc } = stubClient({ list_report_reasons: REASONS });
    renderDialog(client);

    await waitFor(() =>
      // No arguments: the vocabulary is global, so there is nothing to scope
      // by. `undefined` rather than `{}` because a zero-argument function is
      // generated as `Args: never`, and callRpc drops the parameter entirely.
      expect(rpc).toHaveBeenCalledWith("list_report_reasons", undefined),
    );
    expect(await reasonOption("Spam")).toBeInTheDocument();
  });

  it("files with the content it was given, not the reason", async () => {
    const { client, rpc } = stubClient({
      list_report_reasons: REASONS,
      file_report: [{ reportId: "report-1", corroborated: false }],
    });
    renderDialog(client);

    await reasonOption("Spam");
    await userEvent.selectOptions(screen.getByRole("combobox"), "spam");
    await userEvent.type(
      screen.getByRole("textbox"),
      "They posted the same link twice",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /submit report/i }),
    );

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("file_report", {
        app_slug: "forum",
        content_type: "resource",
        content_ref: "resource-42",
        reason: "spam",
        description: "They posted the same link twice",
      }),
    );
  });

  it("distinguishes a corroboration from a fresh report", async () => {
    const { client } = stubClient({
      list_report_reasons: REASONS,
      file_report: [{ reportId: "report-1", corroborated: true }],
    });
    renderDialog(client);

    await reasonOption("Spam");
    await userEvent.selectOptions(screen.getByRole("combobox"), "spam");
    await userEvent.click(
      screen.getByRole("button", { name: /submit report/i }),
    );

    expect(
      await screen.findByText(/already reported this/i),
    ).toBeInTheDocument();
  });

  it("surfaces a raised exception rather than reporting success", async () => {
    const { client } = stubClient({
      list_report_reasons: REASONS,
      // PostgREST resolves a raised exception; only the envelope says it failed.
      file_report: new Error("Too many reports filed in the last hour"),
    });
    renderDialog(client);

    await reasonOption("Spam");
    await userEvent.selectOptions(screen.getByRole("combobox"), "spam");
    await userEvent.click(
      screen.getByRole("button", { name: /submit report/i }),
    );

    expect(await screen.findByText(/too many reports/i)).toBeInTheDocument();
  });
});
