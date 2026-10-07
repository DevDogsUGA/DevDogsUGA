# DevDogs Monorepo

DevDogs is UGA's student developer club. This is the contributor repository: the club's apps (Schedule Builder, Study Group Finder), the database (`supabase/`: every migration, seed and config), and the docs. It has no deploys and no production secrets. The platform app, the email templates, every deploy and the officer CLIs live in the officers' [Backstage](https://github.com/DevDogsUGA/Backstage) repository, which pins this one by commit. Pick your team's docs to get started:

- [Platform](https://devdogsuga.org/docs/platform/getting-started/prerequisites) — the site, console, docs, and OAuth server (Next.js; code in Backstage, database and docs here)
- [Schedule Builder](https://devdogsuga.org/docs/schedule-builder/getting-started/prerequisites) — course schedule planning (Next.js)
- [Study Group Finder](https://devdogsuga.org/docs/study-group-finder/getting-started/prerequisites) — study groups (Flutter)

## Quickstart

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git && cd DevDogsUGA
fnm install && npm install -g pnpm
pnpm install
pnpm devtools setup
```

Full docs: [devdogsuga.org/docs](https://devdogsuga.org/docs)
