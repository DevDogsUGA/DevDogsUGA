---
name: "Git & GitHub"
description: The ideas behind collaborative coding. Commits, branches, remotes and pull requests, and what makes a contribution easy to merge.
order: 1
---

# Git & GitHub

> [!NOTE]
> Adapted from the Git and GitHub workshop at Cold Start, Sep 14, 2026.

Every workshop, and every contribution to a DevDogs project, runs through Git and GitHub.

> [!IMPORTANT]
> You need Git installed and a GitHub account: see the [Prerequisites](../_shared/getting-started/prerequisites.md#for-everyone).

## Git in Four Ideas

- **Repository:** a folder whose whole history is recorded
- **Commit:** a named snapshot of everything, taken when you say so
- **Branch:** a parallel line of snapshots, safe to experiment on
- **Merge:** two lines of work combined back into one

## Git on One Machine

Snapshots you can always walk back to:

```bash
# Start recording a folder's history
git init
# See what's changed since the last snapshot
git status
# Take a snapshot of everything
git add -A
git commit -m "feat: add card"
# List every snapshot you've taken
git log --oneline
```

## Locals and Remotes

Your machine holds a full copy of the repository, and GitHub holds the one you share.

- A **remote** is a copy of the repository that lives somewhere else. The one you cloned from is called `origin`.
- `git clone` copies it down once. `git push` sends your commits up, and `git pull` brings everyone else's down.

> [!NOTE]
> Commits stay on your machine until you push, so nothing is shared by accident.

## Git Across a Team

The same snapshots, shared through `origin`:

```bash
# A branch of your own for one change
git switch -c feat/schedule-card
# Send it to GitHub, and remember where it goes
git push -u origin feat/schedule-card
# Bring in what's landed on main since you started
git pull --rebase origin main
```

Then open a pull request on GitHub.

## GitHub

GitHub is a shared home for repositories, and for the conversation around them:

- It hosts the shared copy of the repository, the one called `origin`
- **Issues** write down problems and features, and discuss them
- **Pull requests** propose a change: they show the diff and tell its story
- **Review** brings comments and approvals before anything merges

## High-Quality Contributions

The difference between a pull request that's merged and one that's closed:

- **Small and focused.** One change per pull request, a diff a reviewer can hold in their head.
- **Tells its story.** A clear title and description, screenshots where they help, and a linked issue.
- **Proven.** It runs locally, passes its checks, and touches nothing it doesn't need to.

<details>
<summary>What does a low-quality one look like?</summary>

The reverse: one giant unfocused diff, no description or issue, and changes nobody tested or explained.

</details>

## Syncing With Origin

`git pull` can bring more than code, so check what changed:

- **Dependencies shift.** A changed lockfile means your installed packages are stale: reinstall them.
- **The database schema moves.** New migrations need applying before the app runs.
- **Config changes.** New settings may need adding to your environment files.

> [!TIP]
> Then restart your dev server. Each project's docs give its exact commands.

## Practice: Oh My Git!

[Oh My Git!](https://ohmygit.org) is a free game for Windows, macOS and Linux that makes the tricky parts visual. Its levels draw your commits and branches live as you type real Git commands, and the later levels teach the advanced moves: rebase, reset and cherry-pick. A few levels make all of this muscle memory.
