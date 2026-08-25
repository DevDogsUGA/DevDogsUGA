# @devdogsuga/config

The shared tsconfig, ESLint, Vitest and OpenNext presets.

Config only, no runtime code. Each preset is a subpath export, taken as-is or
merged with whatever a package adds on top:

```js
import { nextEslintConfig } from "@devdogsuga/config/eslint"; // eslint.config.js
import { nodePreset } from "@devdogsuga/config/vitest/node"; // vitest.config.ts
```

The tsconfig presets under `tsconfig/` are the exception: they are extended by
relative path rather than by package specifier, because vitest's transform reads
these files too and does not resolve specifiers in `extends`.

No generated API reference — this package exports configuration, not symbols.
[Stack](../../docs/monorepo/stack/index.md) is the version-and-conventions page
for the tools these presets configure.
