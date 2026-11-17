# devdogsuga_sdk

The DevDogs SDK for Flutter apps (DogPack, and anything else the club builds): the
club's brand, "Sign in with DevDogs", the catalog API client, the moderation
models, Sentry setup with the club's scrubbing, and a reader for the app's public
configuration.

It is the Dart half of `@devdogsuga/sdk`. About four fifths of it is **generated**
from the same specs as the TypeScript SDK (`packages/sdk-spec` in
[DevDogsUGA/DevDogsUGA](https://github.com/DevDogsUGA/DevDogsUGA)), so the two cannot
drift: the models, the catalog and platform clients, the brand tokens, the shared
constants and the telemetry scrub rules. CI fails when a generated file is out of date.

```yaml
dependencies:
  devdogsuga_sdk: ^0.1.0
```

Import everything with `package:devdogsuga_sdk/devdogsuga_sdk.dart`, or one library:

| Library           | What it holds                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `brand.dart`      | `BrandPalette`, `BrandTheme`, `BrandApps`, `BrandMarks` (SVG), `BrandFonts`, `BrandArtwork`, `DevDogsTheme` |
| `auth.dart`       | `DevDogsAuth`: sign in with DevDogs through `supabase_flutter`                                              |
| `catalog.dart`    | `CatalogClient` and the models for the public UGA course catalog                                            |
| `platform.dart`   | `PlatformClient` and the platform API's types                                                               |
| `moderation.dart` | The report and delivery models (`ReportRequest`, `ModerationMessage`, ...)                                  |
| `telemetry.dart`  | `initTelemetry`, `configureSentry`, `scrubText`                                                             |
| `env.dart`        | `DevDogsEnv`: the app's public configuration from `--dart-define`                                           |
| `constants.dart`  | Hosts, paths, the OAuth provider id and scopes, telemetry sample rates                                      |

## Sign in with DevDogs

The club's OIDC provider is registered on your Supabase project as `custom:devdogsuga`
(`devtools setup` does it for your own project; the deploy does it for production).

```dart
final auth = DevDogsAuth(Supabase.instance.client.auth);
await auth.signIn(redirectTo: 'dev.dogpack://login-callback');
```

`signIn` opens the browser; the session arrives on `onAuthStateChange` once the deep
link completes. `DevDogsAuth.platformUserId(user)` is the member's platform user id,
the id the moderation API takes.

## The catalog

```dart
final catalog = CatalogClient(
  baseUrl: env.catalogUrl, // from CATALOG_URL, never hard-coded
  clientName: 'dogpack/0.1',
);
final terms = await catalog.listTerms();
final exists = await catalog.courseExists(abbr: 'CSCI1301', term: 202702);
```

Every failure is an `ApiException` with the status, the API's `code` and `retryAfterSeconds`
on a 429. The base URL is required on purpose: staging and production are the same code.

## Brand

Colours, the theme and the app identities are code, so unused ones are tree-shaken.
Fonts and artwork are assets, which Flutter bundles only when the app lists them: paste what
you use into your `pubspec.yaml`.

```yaml
flutter:
  fonts:
    - family: Hanken Grotesk
      fonts:
        - asset: packages/devdogsuga_sdk/assets/fonts/HankenGrotesk-400.ttf
        - asset: packages/devdogsuga_sdk/assets/fonts/HankenGrotesk-700.ttf
          weight: 700
    - family: Alan Sans
      fonts:
        - asset: packages/devdogsuga_sdk/assets/fonts/AlanSans-800.ttf
          weight: 800
  assets:
    - packages/devdogsuga_sdk/assets/brand/dogpack.svg
```

```dart
import 'package:material_ui/material_ui.dart';

MaterialApp(
  theme: DevDogsTheme.light(app: BrandApps.dogpack, brandFonts: true),
  darkTheme: DevDogsTheme.dark(app: BrandApps.dogpack, brandFonts: true),
);
```

`DevDogsTheme` returns `material_ui`'s `ThemeData`. Apps using the SDK need
Flutter 3.50.0 or newer and must add `material_ui` and import
`package:material_ui/material_ui.dart` for their Material widgets too.
The SDK declares `environment.flutter: 3.50.0`, which pub enforces as a lower
bound, and Dart ^3.13.0. CI reads the Flutter tag from this pubspec.

## Configuration

The Flutter build reads `--dart-define-from-file=.env`; `devtools setup` writes that file
from `.env.example`. Everything in it ships in the app, so it holds public values only.

```dart
final env = DevDogsEnv.fromDefines(); // SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CATALOG_URL, SENTRY_DSN
env.requireAll([DevDogsEnvKeys.supabaseUrl, DevDogsEnvKeys.catalogUrl]);
```

## Telemetry

```dart
await initTelemetry(
  dsn: env.sentryDsn, // empty: nothing is initialised
  environment: env.environment,
  service: 'dogpack',
  appRunner: () => runApp(const App()),
);
```

Events are scrubbed with the same rules as the TypeScript SDK (absolute paths reduced to a file
name, email addresses and `KEY=value` secrets removed). Replay and screenshots stay off.

## What is not here

Signing. Moderation reports and deliveries are signed (Standard Webhooks) by your backend, in
TypeScript (`@devdogsuga/sdk/moderation`, in a Supabase Edge Function). This package carries the
models only.

## Contributing

Do not edit `lib/src/generated/` or `lib/assets/`: change `packages/sdk-spec` and run
`pnpm -F @devdogsuga/sdk-spec codegen`. Hand-written code lives under the other `lib/src/` folders.
`flutter analyze && flutter test` runs here.
