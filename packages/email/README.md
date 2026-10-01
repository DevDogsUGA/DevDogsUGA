# @devdogsuga/email

react-email sources compiled to typed, React-free HTML templates.

The templates are authored as React components and compiled at build time, so
the runtime an app ships carries no React at all — one call, returning the three
parts a send needs:

```ts
import { render } from "@devdogsuga/email";

const { subject, html, text } = render("TeamInvite", props);
```

The props type is generated from each template's own `Props`, so a renamed or
missing prop is a build error rather than a placeholder in somebody's inbox.

To see a populated template, run `pnpm devtools emails`; it interactively picks
templates and writes browser-ready HTML. `pnpm devtools emails '*' --out
~/emails` is the non-interactive form. Compiler snapshots with sentinel props
remain available from `pnpm --filter @devdogsuga/email codegen`.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/email)
