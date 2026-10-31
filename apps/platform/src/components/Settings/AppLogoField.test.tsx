import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/env", () => ({ env: { NEXT_PUBLIC_AVATARS_BUCKET: "avatars" } }));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/oauthApps", () => ({
  createAppLogoUploadToken: mocks.token,
  saveAppLogo: mocks.save,
}));
vi.mock("~/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl: mocks.upload }),
    },
  }),
}));
// The crop itself is the avatar field's: here it hands over a ready file.
vi.mock("~/components/AvatarField/CropDialog", () => ({
  default: ({
    open,
    feedback,
    onConfirm,
  }: {
    open: boolean;
    feedback?: React.ReactNode;
    onConfirm: (file: File) => void;
  }) =>
    open ? (
      <div role="dialog">
        {feedback}
        <button
          type="button"
          onClick={() =>
            onConfirm(new File(["x"], "logo.webp", { type: "image/webp" }))
          }
        >
          Crop done
        </button>
      </div>
    ) : null,
}));

const { default: AppLogoField } = await import("./AppLogoField");

const TOKEN = { path: "apps/c/1.webp", token: "tok", maxBytes: 1000 };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function pickAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  URL.createObjectURL = vi.fn(() => "blob:logo");
  URL.revokeObjectURL = vi.fn();
  render(<AppLogoField clientId="c" label="Lab" logoUrl={null} />);
  await user.upload(
    screen.getByLabelText("Upload a logo for Lab"),
    new File(["x"], "logo.png", { type: "image/png" }),
  );
  await user.click(await screen.findByRole("button", { name: "Crop done" }));
}

it("takes a token, uploads to Storage, records the path, then toasts and closes", async () => {
  const user = userEvent.setup();
  mocks.token.mockResolvedValue(success(TOKEN));
  mocks.upload.mockResolvedValue({ error: null });
  mocks.save.mockResolvedValue(success());
  await pickAndConfirm(user);
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("c", TOKEN.path),
  );
  expect(mocks.upload).toHaveBeenCalledWith(
    TOKEN.path,
    "tok",
    expect.any(File),
    expect.anything(),
  );
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Logo updated"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.refresh).toHaveBeenCalled();
});

it("shows a refused token in the crop dialog and uploads nothing", async () => {
  const user = userEvent.setup();
  mocks.token.mockResolvedValue(
    failure(
      "The logo, homepage and privacy policy are locked while an app is in production.",
    ),
  );
  await pickAndConfirm(user);
  expect(
    await screen.findByText(/locked while an app is in production/),
  ).toBeVisible();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeVisible();
});

it("refuses a file over the size the token allows, before uploading", async () => {
  const user = userEvent.setup();
  mocks.token.mockResolvedValue(success({ ...TOKEN, maxBytes: 0 }));
  await pickAndConfirm(user);
  expect(
    await screen.findByText("That logo is too large. Try a smaller image"),
  ).toBeVisible();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("says so when Storage refuses the upload, and records nothing", async () => {
  const user = userEvent.setup();
  mocks.token.mockResolvedValue(success(TOKEN));
  mocks.upload.mockResolvedValue({ error: new Error("storage") });
  await pickAndConfirm(user);
  expect(await screen.findByText("Failed to upload the logo")).toBeVisible();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("shows a refused save in the dialog", async () => {
  const user = userEvent.setup();
  mocks.token.mockResolvedValue(success(TOKEN));
  mocks.upload.mockResolvedValue({ error: null });
  mocks.save.mockResolvedValue(failure("The logo did not upload. Try again"));
  await pickAndConfirm(user);
  expect(
    await screen.findByText("The logo did not upload. Try again"),
  ).toBeVisible();
  expect(mocks.toast).not.toHaveBeenCalled();
});
