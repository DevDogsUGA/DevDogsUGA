// @vitest-environment node
/* eslint-disable @typescript-eslint/unbound-method -- asserting on vi.fn() members of a dependency object */
import { describe, expect, it, vi } from "vitest";
import { GithubClient, newBudget } from "./client";
import { checkControl, inventoryPage, resolveRepo, type Repo } from "./repos";
const repo: Repo = {
  id: 792882166,
  private: false,
  name: "DevDogsUGA",
  owner: { id: 168223232, login: "DevDogsUGA", type: "Organization" },
  default_branch: "main",
};
function client(data: unknown[]) {
  const api = new GithubClient({ appId: "", privateKey: "" });
  const call = vi.spyOn(api, "githubFetch");
  for (const value of data)
    call.mockResolvedValueOnce({ ok: true, data: value, next: false });
  return api;
}
describe("public repo operations", () => {
  it("resolves public metadata, rejecting private and malformed links", async () => {
    expect(
      await resolveRepo(client([repo]), newBudget(), "DevDogsUGA/DevDogsUGA"),
    ).toMatchObject({ ok: true, data: { id: 792882166 } });
    expect(
      await resolveRepo(
        client([{ ...repo, private: true }]),
        newBudget(),
        "DevDogsUGA/DevDogsUGA",
      ),
    ).toMatchObject({ kind: "unavailable" });
    for (const typed of ["https://github.com/a/b", "a/..", "a/b/c"])
      expect(await resolveRepo(client([]), newBudget(), typed)).toMatchObject({
        ok: false,
      });
  });
  it("personal control uses only numeric owner id", async () => {
    const personal = {
      ...repo,
      owner: { id: 45, login: "renamed", type: "User" as const },
    };
    expect(
      await checkControl(client([]), newBudget(), personal, {
        id: "45",
        login: "old",
      }),
    ).toMatchObject({ data: { approval: "approved", basis: "personal" } });
    expect(
      await checkControl(client([]), newBudget(), personal, {
        id: "46",
        login: "renamed",
      }),
    ).toMatchObject({ ok: false });
  });
  it.each(["write", "admin", "read", "none"])(
    "checks DevDogs permission %s after resolving immutable user identity",
    async (permission) => {
      const api = client([{ id: 45, login: "current" }, { permission }]);
      const result = await checkControl(api, newBudget(), repo, {
        id: "45",
        login: "stale",
      });
      expect(result.ok).toBe(["write", "admin"].includes(permission));
      expect(api.githubFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("/collaborators/current/permission"),
        expect.anything(),
      );
    },
  );
  it("other organizations require officer approval", async () => {
    expect(
      await checkControl(
        client([]),
        newBudget(),
        { ...repo, owner: { ...repo.owner, id: 900 } },
        { id: "45", login: "u" },
      ),
    ).toMatchObject({ data: { approval: "pending", basis: "officer" } });
  });
  it("inventory filters private and foreign entries defensively", async () => {
    const api = client([
      [
        repo,
        { ...repo, private: true },
        { ...repo, owner: { ...repo.owner, id: 999 } },
      ],
    ]);
    expect(await inventoryPage(api, newBudget(), 2)).toMatchObject({
      data: [repo],
    });
    expect(api.githubFetch).toHaveBeenCalledWith(
      "/orgs/DevDogsUGA/repos?type=public&per_page=100&page=2",
      expect.anything(),
    );
  });
});
