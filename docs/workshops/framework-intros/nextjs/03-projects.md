---
name: "Your Turn: Projects"
description: "Make a route on your own, then compare it with ours."
order: 3
checkpoint: "01-nextjs-intro/03-projects"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-nextjs-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Your Turn: Projects

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=01-nextjs-intro%2F03-projects&from=01-nextjs-intro%2F02-layouts)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](../../../_shared/getting-started/prerequisites.md#git-and-a-github-account).

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-nextjs-intro/02-layouts
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-nextjs-intro 01-nextjs-intro/02-layouts
```

</details>

</div>

Make a Projects page at `/projects` that lists a few projects, each with a name and a short description. Try it before you open our version below.

## Hints

<details>
<summary>Stuck? Show the hints</summary>

- It's a new folder under `app`, with a `page.tsx` in it
- Keep the projects in an array, and turn each into a list item with `.map`
- Give each list item a `key`: it's how React tells list items apart. Use something unique to each item, like its name.

</details>

## Our Version

<details>
<summary>Show our Projects page</summary>

The projects live in an array above the component. `.map` turns each one into an `<li>`, keyed by its name.

```tsx file=app/projects/page.tsx lines=1-20 href=https://github.com/DevDogsUGA/Web-Workshops/blob/53190053c661482af5c9b494f87cc438b8b2b8b3/app/projects/page.tsx vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=01-nextjs-intro%2F03-projects&file=app%2Fprojects%2Fpage.tsx
const projects = [
  { name: "Optimal Schedule Builder", description: "Builds the best class schedule for UGA students." },
  { name: "Study Group Finder", description: "Helps students find study sessions for their classes." },
];

export default function ProjectsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Projects</h1>
      <ul className="mt-6 space-y-4">
        {projects.map((project) => (
          <li key={project.name} className="rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold">{project.name}</h2>
            <p className="text-gray-600">{project.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

</details>

## Try It

Open [localhost:3000/projects](http://localhost:3000/projects). Still no way to get there by clicking: the next step fixes that for every page at once.

<!-- prettier-ignore-end -->
