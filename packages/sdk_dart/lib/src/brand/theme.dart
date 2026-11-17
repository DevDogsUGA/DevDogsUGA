import 'package:material_ui/material_ui.dart';

import '../generated/brand_tokens.dart';

/// Material themes built from the club's brand tokens.
///
/// The tokens are the same values the web uses (`@devdogsuga/sdk/brand`):
/// a mauve neutral ramp with one accent per app. Dark is the club's home
/// ground; light is the same roles on a pale ground, with the accent
/// deepened so it keeps its contrast on white.
///
/// The brand typefaces are opt-in because a package cannot bundle fonts for an
/// app that did not ask (see the README for the `pubspec.yaml` block). Pass
/// `brandFonts: true` once the app declares them.
abstract final class DevDogsTheme {
  /// The family for body text.
  static const String bodyFamily = 'Hanken Grotesk';

  /// The family for headings.
  static const String headingFamily = 'Alan Sans';

  static ThemeData dark({AppBrand app = BrandApps.platform, bool brandFonts = false}) =>
      _build(
        Brightness.dark,
        app,
        brandFonts,
        ColorScheme(
          brightness: Brightness.dark,
          primary: app.ground,
          onPrimary: BrandTheme.ink,
          secondary: app.ground,
          onSecondary: BrandTheme.ink,
          error: BrandPalette.red400,
          onError: BrandTheme.ink,
          surface: BrandTheme.card,
          onSurface: BrandTheme.heading,
          onSurfaceVariant: BrandTheme.muted,
          outline: BrandTheme.border,
          surfaceContainerHighest: BrandPalette.mauve800,
        ),
        scaffold: BrandTheme.background,
      );

  static ThemeData light({AppBrand app = BrandApps.platform, bool brandFonts = false}) {
    final primary = Color.lerp(app.ground, BrandTheme.ink, 0.35)!;
    return _build(
      Brightness.light,
      app,
      brandFonts,
      ColorScheme(
        brightness: Brightness.light,
        primary: primary,
        onPrimary: BrandPalette.white,
        secondary: primary,
        onSecondary: BrandPalette.white,
        error: BrandPalette.red700,
        onError: BrandPalette.white,
        surface: BrandPalette.white,
        onSurface: BrandPalette.mauve950,
        onSurfaceVariant: BrandPalette.mauve600,
        outline: BrandPalette.mauve200,
        surfaceContainerHighest: BrandPalette.mauve100,
      ),
      scaffold: BrandPalette.mauve50,
    );
  }

  static ThemeData _build(
    Brightness brightness,
    AppBrand app,
    bool brandFonts,
    ColorScheme scheme, {
    required Color scaffold,
  }) {
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffold,
      fontFamily: brandFonts ? bodyFamily : null,
    );
    final text = base.textTheme;
    TextStyle? heading(TextStyle? style) => style?.copyWith(
          fontFamily: brandFonts ? headingFamily : style.fontFamily,
          fontWeight: FontWeight.w800,
        );
    return base.copyWith(
      textTheme: text.copyWith(
        displayLarge: heading(text.displayLarge),
        displayMedium: heading(text.displayMedium),
        displaySmall: heading(text.displaySmall),
        headlineLarge: heading(text.headlineLarge),
        headlineMedium: heading(text.headlineMedium),
        headlineSmall: heading(text.headlineSmall),
        titleLarge: heading(text.titleLarge),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scaffold,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: scheme.outline, width: 1.5),
        ),
      ),
      dividerColor: scheme.outline,
    );
  }
}
