## 0.1.0-next.2

- `DevDogsTheme` now returns `material_ui` ThemeData. Apps using it must migrate
  their Material imports to `package:material_ui/material_ui.dart`.
- Require Flutter >=3.50.0 and Dart ^3.13.0. The Flutter lower bound is the CI pin.

## 0.1.0

First release.

- Phase 1: `brand` (palette, theme builder, app identities, marks, fonts, artwork) and `auth`
  ("Sign in with DevDogs" through `supabase_flutter`).
- Phase 2: the generated `CatalogClient` and `PlatformClient`.
- Phase 3: the moderation models, `telemetry` (Sentry setup and the shared scrub rules) and
  `env` (the app's public configuration).

Prereleases are published as `0.1.0-next.N` from tags pushed on `main`.
