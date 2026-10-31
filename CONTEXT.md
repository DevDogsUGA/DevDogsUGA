# Domain context

These are the words this codebase uses for its own concepts. Use them exactly, in code, comments, docs and planning. The
decisions behind them are in `devdogs-plan/dashboard-redesign-plan.md`, which is outside the repo.

## Signed-in area

- **Dashboard.** Every signed-in page lives under `/dashboard`: Account, Projects, Developer, and the officer tools.
  - Signed out, any `/dashboard/*` path redirects to sign-in and returns to the same path.
  - Signed in without access, a page renders the access-denied card.
  - An unknown path is a 404.
- **Section.** One entry in the dashboard nav (Profile, Projects, Moderation, ...). Each section has a group, an access rule
  and a refusal policy.
- **Section registry.** The single list of sections (`config/dashboard.ts`). The side nav, the profile popover, the mobile
  sheet, search, the access-denied card and the page gates all read it. Don't restate a section's rule anywhere else.
- **Console.** The officer group of sections. It has no URL segment of its own: officer tools sit at `/dashboard/<tool>`.
- **Overview.** The `/dashboard` landing page.

## Access

- **Caller.** The signed-in member as the access module sees them: permission flags, `isLeader`, rank. It is loaded once per
  request.
- **Access rule.** A pure function of the Caller, named after what it allows (`manageAttendance`, `useGraphics`,
  `reviewProjectReports`). Page gates, actions and the registry all name the same rule.
- **Record rule.** A check that needs the record itself: project owner, report advisor, OAuth client owner. It lives in that
  record's domain module, never in the access module.
- **Officer.** A member who holds a leadership role (`isLeader`).

## Actions

- **Action result.** What every server action returns:
  - success: `{ ok: true, data?, message? }`
  - failure: `{ ok: false, message, fieldErrors? }`

  Expected failures are returned, and only bugs throw.

- **Draft.** A form that edits saved values. It uses the save bar: the changes are held until **Save** or **Discard**, and
  navigation is guarded while changes are unsaved.
- **Command.** One action that does one thing: award, resend, publish, check in. It uses the Command module, with its error
  shown inline and its success shown as a toast. Multi-step flows are built from several Commands.

## Projects

- **Project.** A member-made body of work, edited from the dashboard and anchored to one or more GitHub repos. Hackathon
  entries, club apps and the platform itself are all Projects.
- **Owner.** A member who can edit a Project: its name, tags, repos, showcase fields and Submissions. The creator is the first
  Owner.
- **Contributor.** Anyone with a Counted commit in one of a Project's repos. This is derived from commits; nobody keeps it as a
  list.
- **Project repo.** A GitHub repo linked to a Project. It is identified by its numeric GitHub id, not its name.
  - It is **available** or **unavailable**: private or deleted.
  - Linking one needs proof of control.
- **Counted commit.** A commit that has landed on a Project repo's default branch, authored by a member's linked GitHub
  account. It is stored by SHA and stays valid even after its repo becomes unavailable.
- **EL report.** A member's Experiential Learning claim: a Project, a date range, hours, Counted commits and a reflection of at
  least 100 words.
  - Each commit backs at most one report.
  - A report is reviewed by the Project's advisor or by a holder of `canReviewProjectReports`, never by its author.
- **Advisor.** An experienced member that officers optionally assign to a Project to review its EL reports.
- **DevDogs-owned.** A Project officers have taken over. Officers are its Owners and it can't be deleted. The platform is one.
- **Hackathon.** An event that members enter. It is synced from Devpost, or submitted by a member and approved by an officer.
- **Submission.** A Project entered into a Hackathon: its link, its DevDogs team and an optional result.
- **Featured / in switcher.** Officer toggles on a Project that put it on the homepage or in the app switcher.

## Docs

- **Docs.** Platform-authored documentation: Workshops, Shared tooling, Ops, and the guides for building on DevDogs.
- **Contribute.** Project-authored documentation: each opted-in Project's `docs/` folder from its default branch.
- **Docs preview.** A live, signed-in render of Contribute docs that haven't been published yet.
