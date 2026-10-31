import { describe, expect, it } from "vitest";
import {
  activationBlock,
  archiveBlock,
  deleteBlock,
  editVerdict,
  fileVerdict,
  isOwner,
  legacyBlock,
  linkBlock,
  mayEdit,
  mayManageOwners,
  mayUnarchive,
  officerBlock,
  reviewVerdict,
  statusFromLinks,
  unarchiveBlock,
  unlinkBlock,
  type ProjectFacts,
} from "./records";

const project = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({
  status: "active",
  devdogsOwned: false,
  advisorId: null,
  ownerIds: ["owner"],
  ...over,
});
const owner = { userId: "owner", isOfficer: false };
const officer = { userId: "officer", isOfficer: true };
const stranger = { userId: "stranger", isOfficer: false };

describe("who may edit (D0 section 8.1)", () => {
  it("is an explicit owner", () => {
    expect(isOwner(project(), owner)).toBe(true);
    expect(mayEdit(project(), owner)).toBe(true);
    expect(mayEdit(project(), stranger)).toBe(false);
  });
  it("is not an officer on an ordinary project", () => {
    expect(mayEdit(project(), officer)).toBe(false);
  });
  it("is any officer on a DevDogs-owned project, with no owner rows", () => {
    const owned = project({ devdogsOwned: true, ownerIds: [] });
    expect(mayEdit(owned, officer)).toBe(true);
    expect(mayEdit(owned, stranger)).toBe(false);
  });
  it("keeps owners and officers on owner management and un-archiving", () => {
    for (const rule of [mayManageOwners, mayUnarchive]) {
      expect(rule(project(), owner)).toBe(true);
      expect(rule(project(), officer)).toBe(true);
      expect(rule(project(), stranger)).toBe(false);
    }
  });
});

describe("lifecycle guards", () => {
  it("lets an owner archive an active project, once", () => {
    expect(archiveBlock(project(), owner)).toBeNull();
    expect(archiveBlock(project({ status: "archived" }), owner)).toMatch(
      /already archived/,
    );
    expect(archiveBlock(project(), stranger)).toMatch(/owner/);
  });
  it("does not let an officer archive an ordinary project", () => {
    expect(archiveBlock(project(), officer)).toMatch(/owner/);
    expect(
      archiveBlock(project({ devdogsOwned: true, ownerIds: [] }), officer),
    ).toBeNull();
  });
  it("lets an owner or an officer un-archive, once a repo is approved", () => {
    const archived = project({ status: "archived" });
    expect(unarchiveBlock(archived, owner, 1)).toBeNull();
    expect(unarchiveBlock(archived, officer, 2)).toBeNull();
    expect(unarchiveBlock(archived, owner, 0)).toMatch(/approved repository/);
    expect(unarchiveBlock(archived, stranger, 1)).toMatch(
      /owner or an officer/,
    );
    expect(unarchiveBlock(project(), owner, 1)).toMatch(/already active/);
  });
  it("needs an approved link to be active", () => {
    expect(activationBlock(0)).not.toBeNull();
    expect(activationBlock(1)).toBeNull();
  });
  it("deletes only with no reports and no submissions", () => {
    const none = { reports: 0, submissions: 0 };
    expect(deleteBlock(project(), owner, none)).toBeNull();
    expect(
      deleteBlock(project(), owner, { reports: 1, submissions: 0 }),
    ).toMatch(/reports or submissions/);
    expect(
      deleteBlock(project(), owner, { reports: 0, submissions: 1 }),
    ).toMatch(/reports or submissions/);
    expect(deleteBlock(project(), stranger, none)).toMatch(/owner/);
  });
  it("never deletes a DevDogs-owned project, even for an officer", () => {
    const owned = project({ devdogsOwned: true, ownerIds: [] });
    expect(deleteBlock(owned, officer, { reports: 0, submissions: 0 })).toMatch(
      /DevDogs-owned/,
    );
  });
  it("turns a legacy row away", () => {
    expect(legacyBlock("active")).toBeNull();
    expect(legacyBlock("archived")).toBeNull();
    expect(legacyBlock("proposed")).toMatch(/predates/);
    expect(legacyBlock("declined")).toMatch(/predates/);
  });
  it("keeps officer-only actions to officers", () => {
    expect(officerBlock(officer)).toBeNull();
    expect(officerBlock(owner)).toMatch(/officer/);
  });
});

describe("repo links", () => {
  const links = [
    { githubRepoId: "1", approval: "approved" },
    { githubRepoId: "2", approval: "pending" },
  ];
  it("refuses a repo already linked and an eleventh link", () => {
    expect(linkBlock(links, "1", 10)).toMatch(/already linked/);
    expect(linkBlock(links, "3", 10)).toBeNull();
    const ten = Array.from({ length: 10 }, (_, i) => ({
      githubRepoId: String(i + 10),
      approval: "approved",
    }));
    expect(linkBlock(ten, "99", 10)).toMatch(/at most 10/);
  });
  it("unlinks a repo that is not the last, not cited and not the last approved", () => {
    expect(unlinkBlock(project(), links, "2", new Set())).toBeNull();
  });
  it("keeps the last link", () => {
    expect(unlinkBlock(project(), [links[0]!], "1", new Set())).toMatch(
      /at least one repository/,
    );
  });
  it("keeps a link existing citations depend on", () => {
    const two = [
      { githubRepoId: "1", approval: "approved" },
      { githubRepoId: "2", approval: "approved" },
    ];
    expect(unlinkBlock(project(), two, "1", new Set(["1"]))).toMatch(/cite/);
    expect(unlinkBlock(project(), two, "2", new Set(["1"]))).toBeNull();
  });
  it("keeps the last approved link of an active project", () => {
    expect(unlinkBlock(project(), links, "1", new Set())).toMatch(
      /at least one approved/,
    );
    expect(
      unlinkBlock(project({ status: "archived" }), links, "1", new Set()),
    ).toBeNull();
  });
  it("says so for a repo that is not linked", () => {
    expect(unlinkBlock(project(), links, "9", new Set())).toMatch(/not linked/);
  });
});

describe("what a new project becomes (Q41)", () => {
  const personal = { approval: "approved", basis: "personal" } as const;
  const write = { approval: "approved", basis: "devdogs-write" } as const;
  const other = { approval: "pending", basis: "officer" } as const;
  it("is active with a personal repo", () => {
    expect(statusFromLinks([personal])).toBe("active");
  });
  it("is active with a DevDogsUGA repo the member can write to", () => {
    expect(statusFromLinks([write])).toBe("active");
  });
  it("stays archived while every repo waits on an officer", () => {
    expect(statusFromLinks([other])).toBe("archived");
    expect(statusFromLinks([other, other])).toBe("archived");
  });
  it("is active when any one link is approved", () => {
    expect(statusFromLinks([other, personal])).toBe("active");
  });
});

describe("who files a report", () => {
  const ok = { isOfficer: false, isContributor: true, projectStatus: "active" };
  it("is a contributor on an active project", () => {
    expect(fileVerdict(ok)).toBe("yes");
  });
  it("is never an officer, whatever else is true (Q125)", () => {
    expect(fileVerdict({ ...ok, isOfficer: true })).toBe("officer");
  });
  it("needs commits in the project's repos", () => {
    expect(fileVerdict({ ...ok, isContributor: false })).toBe(
      "not_contributor",
    );
  });
  it("needs an active project", () => {
    expect(fileVerdict({ ...ok, projectStatus: "archived" })).toBe(
      "not_active",
    );
  });
});

describe("editing a report", () => {
  it("is the author's until it is approved, and again once returned", () => {
    const base = { authorId: "a", actorId: "a" };
    expect(editVerdict({ ...base, status: "submitted" })).toBe("yes");
    expect(editVerdict({ ...base, status: "returned" })).toBe("yes");
    expect(editVerdict({ ...base, status: "approved" })).toBe("approved");
  });
  it("is nobody else's", () => {
    expect(
      editVerdict({ authorId: "a", actorId: "b", status: "submitted" }),
    ).toBe("not_author");
  });
});

describe("who reviews a report", () => {
  const base = {
    actorId: "r",
    canReview: false,
    advisorId: null,
    authorId: "m",
  };
  it("is the project's advisor", () => {
    expect(reviewVerdict({ ...base, advisorId: "r" })).toBe("yes");
  });
  it("is a holder of reviewProjectReports, for any project", () => {
    expect(reviewVerdict({ ...base, canReview: true })).toBe("yes");
  });
  it("is not an officer without either", () => {
    expect(reviewVerdict(base)).toBe("forbidden");
  });
  it("is never the author, advisor or holder alike", () => {
    expect(reviewVerdict({ ...base, actorId: "m", advisorId: "m" })).toBe(
      "own_report",
    );
    expect(reviewVerdict({ ...base, actorId: "m", canReview: true })).toBe(
      "own_report",
    );
  });
});
