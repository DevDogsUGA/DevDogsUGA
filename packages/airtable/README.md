# @devdogsuga/airtable

The Airtable field registry, sync engine and base verifier.

One table spec per synced table declares every field and its direction, and the
sync functions iterate that spec — so adding a field is a change to the spec,
not to the code that moves records:

```ts
import { applyPull, meetings } from "@devdogsuga/airtable";
```

`AirtableClient` is the typed REST wrapper underneath; `scaffoldBase` and
`discoverIds` back the `pnpm devtools airtable` subcommands, which is how the
base gets created and its ids pulled back into the registry.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/airtable) ·
[Airtable](../../docs/platform/guides/airtable/index.md)
