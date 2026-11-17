import 'dart:convert';
import 'dart:io';

import 'package:devdogsuga_sdk/brand.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';

Color _hex(String value) =>
    Color(0xFF000000 | int.parse(value.substring(1), radix: 16));

void main() {
  final tokens = jsonDecode(
    File('../sdk-spec/brand/tokens.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  test('the generated palette matches the exported tokens', () {
    final palette = tokens['palette'] as Map<String, dynamic>;
    expect(BrandPalette.mauve950, _hex(palette['mauve-950'] as String));
    expect(BrandPalette.red400, _hex(palette['red400'] as String));
    expect(BrandPalette.white, _hex(palette['white'] as String));
    expect(BrandTheme.background, BrandPalette.mauve950);
  });

  test('apps carry their identity and a tile colour', () {
    expect(BrandApps.dogpack.name, 'DogPack');
    expect(BrandApps.dogpack.host, 'dogpack.dev');
    expect(BrandApps.dogdays.ground, BrandPalette.red400);
    expect(BrandApps.all, hasLength(3));
  });

  test('the marks are SVG strings drawn in currentColor', () {
    for (final mark in [BrandMarks.dogdays, BrandMarks.dogpack]) {
      expect(mark, startsWith('<svg '));
      expect(mark, contains('currentColor'));
    }
  });

  test('every font and artwork asset the tokens name ships in the package', () {
    for (final font in BrandFonts.all) {
      final file = font.asset.replaceFirst(
        'packages/devdogsuga_sdk/',
        'lib/',
      );
      expect(File(file).existsSync(), isTrue, reason: file);
    }
    for (final file in (tokens['artwork'] as List<dynamic>).cast<String>()) {
      expect(File('lib/assets/brand/$file').existsSync(), isTrue, reason: file);
    }
    expect(BrandFonts.all.map((f) => f.family), contains('Alan Sans'));
  });

  test('dark and light themes use the app accent', () {
    final dark = DevDogsTheme.dark(app: BrandApps.dogpack);
    expect(dark.brightness, Brightness.dark);
    expect(dark.colorScheme.primary, BrandApps.dogpack.ground);
    expect(dark.scaffoldBackgroundColor, BrandTheme.background);

    final light = DevDogsTheme.light(app: BrandApps.dogpack);
    expect(light.brightness, Brightness.light);
    // Deepened so it keeps its contrast on a pale ground.
    expect(light.colorScheme.primary, isNot(BrandApps.dogpack.ground));
    expect(light.colorScheme.onPrimary, BrandPalette.white);
  });

  test('headings take the display face only once the app opts in', () {
    final plain = DevDogsTheme.dark();
    final branded = DevDogsTheme.dark(brandFonts: true);
    expect(plain.textTheme.headlineLarge!.fontFamily,
        isNot(DevDogsTheme.headingFamily));
    expect(branded.textTheme.headlineLarge!.fontFamily,
        DevDogsTheme.headingFamily);
    expect(branded.textTheme.headlineLarge!.fontWeight, FontWeight.w800);
  });
}
