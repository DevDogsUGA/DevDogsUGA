// The Dart half of `docs-build gen`. Everything else the generator documents is
// TypeScript, which it reads in-process with the TS compiler API; there is no
// equivalent for Dart from Node, so this script runs under the Flutter SDK's
// own analyzer and hands the result across as JSON. The shape it writes is a
// contract with `packages/docs-build/src/gen/dart.ts`. Change one and the other
// stops parsing, so `version` is bumped whenever a field's meaning moves.
//
//   dart run tool/docs_extract.dart [--lib <dir>] [--out <file>]
//
// Declarations are read out of the resolved element model rather than the AST.
// Classifying a widget needs the transitive supertype chain, and `super.key`
// only has a type once the super constructor is resolved, so the AST could not
// answer either question on its own.

import 'dart:convert';
import 'dart:io';

import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:analyzer/source/line_info.dart';

/// Bumped whenever a field in the emitted document changes meaning. The Node
/// reader refuses anything it does not recognise rather than guessing.
const int schemaVersion = 1;

Future<void> main(List<String> args) async {
  final _Options options;
  try {
    options = _Options.parse(args);
  } on FormatException catch (error) {
    stderr.writeln('docs_extract: ${error.message}');
    stderr.writeln(_usage);
    exitCode = 64;
    return;
  }

  if (options.help) {
    stdout.writeln(_usage);
    return;
  }

  final appRoot = _ancestorContaining(Directory.current, 'pubspec.yaml');
  if (appRoot == null) {
    stderr.writeln(
      'docs_extract: no pubspec.yaml above ${Directory.current.path}; '
      'run this from the Flutter app directory.',
    );
    exitCode = 66;
    return;
  }

  final libDir = Directory(_resolve(options.lib));
  if (!libDir.existsSync()) {
    stderr.writeln('docs_extract: ${libDir.path} does not exist.');
    exitCode = 66;
    return;
  }

  final document = await _extract(appRoot: appRoot, libDir: libDir);
  final json = '${const JsonEncoder.withIndent('  ').convert(document)}\n';

  final out = options.out;
  if (out == null) {
    stdout.write(json);
  } else {
    final file = File(_resolve(out));
    file.parent.createSync(recursive: true);
    file.writeAsStringSync(json);
  }
}

const String _usage = '''
Usage: dart run tool/docs_extract.dart [options]

  --lib <dir>   Directory to walk, relative to the working directory.
                Defaults to lib.
  --out <file>  Write the JSON here instead of stdout.
  -h, --help    Show this message.''';

class _Options {
  const _Options({required this.lib, required this.out, required this.help});

  final String lib;
  final String? out;
  final bool help;

  static _Options parse(List<String> args) {
    var lib = 'lib';
    String? out;
    var help = false;

    for (var i = 0; i < args.length; i++) {
      final arg = args[i];
      switch (arg) {
        case '-h':
        case '--help':
          help = true;
        case '--lib':
        case '--out':
          if (i + 1 >= args.length) {
            throw FormatException('$arg needs a value.');
          }
          final value = args[i + 1];
          i++;
          if (arg == '--lib') {
            lib = value;
          } else {
            out = value;
          }
        default:
          throw FormatException('unknown option $arg.');
      }
    }

    return _Options(lib: lib, out: out, help: help);
  }
}

Future<Map<String, Object?>> _extract({
  required Directory appRoot,
  required Directory libDir,
}) async {
  final files = _dartFiles(libDir);
  final declarations = <Map<String, Object?>>[];

  // One collection over the whole directory rather than one per file: the
  // contexts share resolved libraries, so `StatelessWidget` is looked up once
  // no matter how many widgets extend it.
  final collection = AnalysisContextCollection(includedPaths: [libDir.path]);
  try {
    for (final path in files) {
      final session = collection.contextFor(path).currentSession;
      final unit = await session.getResolvedUnit(path);
      if (unit is! ResolvedUnitResult) {
        stderr.writeln('docs_extract: could not resolve $path; skipping.');
        continue;
      }
      final library = _posix(_relativeTo(path, appRoot.path));
      declarations.addAll(_declarationsIn(unit, library));
    }
  } finally {
    await collection.dispose();
  }

  return {
    'version': schemaVersion,
    'app': _basename(_posix(appRoot.path)),
    'generatedFrom': _generatedFrom(appRoot, libDir),
    'declarations': declarations,
  };
}

/// The lib directory as the monorepo sees it, so the emitted pages can link to
/// a path a reader can paste into an editor. Falls back to `apps/<app>/...`
/// when the workspace root is not an ancestor, which is how the app looks when
/// CI unpacks it on its own.
String _generatedFrom(Directory appRoot, Directory libDir) {
  final repoRoot = _ancestorContaining(appRoot, 'pnpm-workspace.yaml');
  if (repoRoot != null) {
    return _posix(_relativeTo(libDir.path, repoRoot.path));
  }
  final app = _basename(_posix(appRoot.path));
  return 'apps/$app/${_posix(_relativeTo(libDir.path, appRoot.path))}';
}

/// Every `.dart` file under [dir], sorted so the output is stable between runs
/// (directory listings are not ordered). Generated sources are dropped: they
/// carry no hand-written documentation and would bury the rest.
List<String> _dartFiles(Directory dir) {
  final files = <String>[];
  for (final entity in dir.listSync(recursive: true, followLinks: false)) {
    if (entity is! File) {
      continue;
    }
    final name = _basename(_posix(entity.path));
    if (!name.endsWith('.dart') ||
        name.endsWith('.g.dart') ||
        name.endsWith('.freezed.dart')) {
      continue;
    }
    files.add(entity.path);
  }
  files.sort();
  return files;
}

/// Declarations are read off the file's own [LibraryFragment] rather than the
/// [LibraryElement]: a library split across `part` files would otherwise report
/// every declaration once per file, all attributed to whichever one was walked.
List<Map<String, Object?>> _declarationsIn(
  ResolvedUnitResult unit,
  String library,
) {
  final fragment = unit.libraryFragment;
  final found = <_Declaration>[];

  for (final classFragment in fragment.classes) {
    final element = classFragment.element;
    final line = _lineOf(classFragment, unit.lineInfo);
    final name = _publicName(element);
    if (name == null || line == null) {
      continue;
    }
    found.add(
      _Declaration(
        line: line,
        json: {
          'name': name,
          'kind': _isWidget(element) ? 'widget' : 'class',
          'library': library,
          'line': line,
          'doc': _prose(element.documentationComment),
          'signature': _classSignature(element),
          'superclass': _superclassOf(element),
          'params': _paramsOfType(element),
        },
      ),
    );
  }

  for (final enumFragment in fragment.enums) {
    final element = enumFragment.element;
    final line = _lineOf(enumFragment, unit.lineInfo);
    final name = _publicName(element);
    if (name == null || line == null) {
      continue;
    }
    found.add(
      _Declaration(
        line: line,
        json: {
          'name': name,
          'kind': 'enum',
          'library': library,
          'line': line,
          'doc': _prose(element.documentationComment),
          'signature': _enumSignature(element),
          'superclass': null,
          'params': <Object?>[],
        },
      ),
    );
  }

  for (final extensionFragment in fragment.extensions) {
    final element = extensionFragment.element;
    final line = _lineOf(extensionFragment, unit.lineInfo);
    final name = _publicName(element);
    if (name == null || line == null) {
      continue;
    }
    found.add(
      _Declaration(
        line: line,
        json: {
          'name': name,
          'kind': 'extension',
          'library': library,
          'line': line,
          'doc': _prose(element.documentationComment),
          'signature': 'extension $name'
              '${_typeParameters(element.typeParameters)} '
              'on ${element.extendedType.getDisplayString()}',
          'superclass': null,
          'params': <Object?>[],
        },
      ),
    );
  }

  for (final functionFragment in fragment.functions) {
    final element = functionFragment.element;
    final line = _lineOf(functionFragment, unit.lineInfo);
    final name = _publicName(element);
    if (name == null || line == null) {
      continue;
    }
    found.add(
      _Declaration(
        line: line,
        json: {
          'name': name,
          'kind': 'function',
          'library': library,
          'line': line,
          'doc': _prose(element.documentationComment),
          'signature': '${element.returnType.getDisplayString()} $name'
              '${_typeParameters(element.typeParameters)}'
              '${_parameterList(element.formalParameters)}',
          'superclass': null,
          'params': _params(element.formalParameters),
        },
      ),
    );
  }

  for (final variableFragment in fragment.topLevelVariables) {
    final element = variableFragment.element;
    final line = _lineOf(variableFragment, unit.lineInfo);
    final name = _publicName(element);
    if (name == null || line == null) {
      continue;
    }
    // A mutable top-level would be a lie under `kind: "constant"`, and the
    // schema has nowhere else to put it, so say so and move on.
    if (!element.isConst && !element.isFinal) {
      stderr.writeln(
        'docs_extract: $library:$line $name is mutable; skipping.',
      );
      continue;
    }
    found.add(
      _Declaration(
        line: line,
        json: {
          'name': name,
          'kind': 'constant',
          'library': library,
          'line': line,
          'doc': _prose(element.documentationComment),
          'signature': '${element.isConst ? 'const' : 'final'} '
              '${element.type.getDisplayString()} $name',
          'superclass': null,
          'params': <Object?>[],
        },
      ),
    );
  }

  _warnUnsupported(unit, library, 'mixin', fragment.mixins);
  _warnUnsupported(unit, library, 'extension type', fragment.extensionTypes);
  _warnUnsupported(unit, library, 'typedef', fragment.typeAliases);

  found.sort((a, b) => a.line.compareTo(b.line));
  return [for (final declaration in found) declaration.json];
}

/// The schema has no kind for these, and inventing one on this side would only
/// break the reader. Naming them on stderr keeps a documented declaration from
/// vanishing without a trace.
void _warnUnsupported(
  ResolvedUnitResult unit,
  String library,
  String kind,
  List<Fragment> fragments,
) {
  for (final fragment in fragments) {
    final name = _publicName(fragment.element);
    final line = _lineOf(fragment, unit.lineInfo);
    if (name == null || line == null) {
      continue;
    }
    stderr.writeln('docs_extract: $library:$line $name is a $kind; skipping.');
  }
}

class _Declaration {
  const _Declaration({required this.line, required this.json});

  final int line;
  final Map<String, Object?> json;
}

/// Null for anything the page should not list: unnamed declarations, and names
/// starting with `_`, which are unreachable from outside the library.
String? _publicName(Element element) {
  final name = element.name;
  if (name == null || name.isEmpty || name.startsWith('_')) {
    return null;
  }
  return name;
}

int? _lineOf(Fragment fragment, LineInfo lineInfo) {
  final offset = fragment.nameOffset;
  if (offset == null) {
    return null;
  }
  return lineInfo.getLocation(offset).lineNumber;
}

/// The library check matters: a local class called `StatefulWidget` would
/// otherwise pull every subclass into the widget gallery.
bool _isWidget(InterfaceElement element) {
  for (final supertype in element.allSupertypes) {
    final name = supertype.element.name;
    if (name != 'StatelessWidget' && name != 'StatefulWidget') {
      continue;
    }
    final uri = supertype.element.library.uri;
    if (uri.scheme == 'package' && uri.pathSegments.first == 'flutter') {
      return true;
    }
  }
  return false;
}

String? _superclassOf(InterfaceElement element) {
  final supertype = element is ClassElement ? element.supertype : null;
  if (supertype == null) {
    return null;
  }
  final superclass = supertype.element;
  // Every class extends Object implicitly; reporting that is noise.
  if (superclass is ClassElement && superclass.isDartCoreObject) {
    return null;
  }
  return supertype.getDisplayString();
}

String _classSignature(ClassElement element) {
  final parts = <String>[];
  // `sealed` already implies `abstract` in the element model, but the two
  // keywords cannot both appear in source.
  if (element.isSealed) {
    parts.add('sealed');
  } else {
    if (element.isAbstract) {
      parts.add('abstract');
    }
    if (element.isBase) {
      parts.add('base');
    } else if (element.isInterface) {
      parts.add('interface');
    } else if (element.isFinal) {
      parts.add('final');
    }
  }
  if (element.isMixinClass) {
    parts.add('mixin');
  }
  parts.add('class');
  parts.add('${element.displayName}${_typeParameters(element.typeParameters)}');

  final superclass = _superclassOf(element);
  if (superclass != null) {
    parts.add('extends $superclass');
  }
  parts.addAll(_mixinAndInterfaceClauses(element));
  return parts.join(' ');
}

String _enumSignature(EnumElement element) {
  final parts = <String>[
    'enum',
    '${element.displayName}${_typeParameters(element.typeParameters)}',
    ..._mixinAndInterfaceClauses(element),
  ];
  return parts.join(' ');
}

List<String> _mixinAndInterfaceClauses(InterfaceElement element) {
  return [
    if (element.mixins.isNotEmpty)
      'with ${element.mixins.map((m) => m.getDisplayString()).join(', ')}',
    if (element.interfaces.isNotEmpty)
      'implements '
          '${element.interfaces.map((i) => i.getDisplayString()).join(', ')}',
  ];
}

String _typeParameters(List<TypeParameterElement> typeParameters) {
  if (typeParameters.isEmpty) {
    return '';
  }
  final rendered = typeParameters.map((parameter) {
    final bound = parameter.bound;
    final name = parameter.displayName;
    return bound == null ? name : '$name extends ${bound.getDisplayString()}';
  });
  return '<${rendered.join(', ')}>';
}

/// The constructor a reader would actually call. The unnamed one is the
/// convention for widgets; anything else picks its first public named
/// constructor so a factory-only class still gets a parameter table.
List<Map<String, Object?>> _paramsOfType(InterfaceElement element) {
  ConstructorElement? fallback;
  for (final constructor in element.constructors) {
    final name = constructor.name;
    if (name == null || name.startsWith('_')) {
      continue;
    }
    if (name == 'new') {
      return _params(constructor.formalParameters);
    }
    fallback ??= constructor;
  }
  return fallback == null ? [] : _params(fallback.formalParameters);
}

List<Map<String, Object?>> _params(List<FormalParameterElement> parameters) {
  return [
    for (final parameter in parameters)
      {
        'name': parameter.displayName,
        'type': parameter.type.getDisplayString(),
        'required': parameter.isRequired,
        'default': parameter.defaultValueCode,
        'doc': _parameterDoc(parameter),
      },
  ];
}

/// A field formal (`this.title`) and a super formal (`super.key`) never carry a
/// doc comment themselves. The prose lives on the field, or on the matching
/// parameter one constructor up. Following that is what gives a widget's
/// parameter table any descriptions at all.
String? _parameterDoc(FormalParameterElement parameter, [int depth = 0]) {
  final own = _prose(parameter.documentationComment);
  if (own != null) {
    return own;
  }
  if (parameter is FieldFormalParameterElement) {
    return _prose(parameter.field?.documentationComment);
  }
  // `super.key` can chain through several constructors. The bound stops a
  // cycle in unresolvable code from spinning here.
  if (parameter is SuperFormalParameterElement && depth < 8) {
    final inherited = parameter.superConstructorParameter;
    if (inherited != null && _sharePackage(parameter, inherited)) {
      return _parameterDoc(inherited, depth + 1);
    }
  }
  return null;
}

/// Inheritance stops at the package boundary. Following `super.key` all the way
/// into the framework would stamp five paragraphs about [GlobalKey] onto every
/// widget in the app, which says nothing about the widget being documented.
bool _sharePackage(Element left, Element right) {
  final from = left.library?.uri;
  final to = right.library?.uri;
  if (from == null || to == null || from.scheme != to.scheme) {
    return false;
  }
  // Sources outside `lib/` resolve to `file:` URIs and have no package to
  // compare, so being in the same tree is as close as this gets.
  if (from.scheme != 'package') {
    return true;
  }
  return _firstSegment(from) == _firstSegment(to);
}

String? _firstSegment(Uri uri) =>
    uri.pathSegments.isEmpty ? null : uri.pathSegments.first;

String _parameterList(List<FormalParameterElement> parameters) {
  final positional = <String>[];
  final optional = <String>[];
  final named = <String>[];
  for (final parameter in parameters) {
    final rendered = _parameterSource(parameter);
    if (parameter.isNamed) {
      named.add(rendered);
    } else if (parameter.isOptionalPositional) {
      optional.add(rendered);
    } else {
      positional.add(rendered);
    }
  }
  final groups = <String>[
    ...positional,
    if (optional.isNotEmpty) '[${optional.join(', ')}]',
    if (named.isNotEmpty) '{${named.join(', ')}}',
  ];
  return '(${groups.join(', ')})';
}

String _parameterSource(FormalParameterElement parameter) {
  final defaultValue = parameter.defaultValueCode;
  return [
    if (parameter.isRequiredNamed) 'required ',
    parameter.type.getDisplayString(),
    ' ',
    parameter.displayName,
    if (defaultValue != null) ' = $defaultValue',
  ].join();
}

/// Turns a dartdoc comment into prose the emitter can drop into markdown:
/// delimiters gone, hard wraps healed, paragraph breaks kept. Fenced code and
/// list items are left on their own lines, because joining those is the one
/// case where healing a wrap changes what the text means.
String? _prose(String? comment) {
  if (comment == null) {
    return null;
  }

  final blocks = <String>[];
  final paragraph = <String>[];
  final fence = <String>[];
  var inFence = false;

  void flushParagraph() {
    if (paragraph.isNotEmpty) {
      blocks.add(paragraph.join(' '));
      paragraph.clear();
    }
  }

  for (final raw in const LineSplitter().convert(comment)) {
    final line = _stripDelimiters(raw);
    if (line == null) {
      continue;
    }
    final trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      fence.add(line);
      if (inFence) {
        blocks.add(fence.join('\n'));
        fence.clear();
      } else {
        flushParagraph();
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      fence.add(line);
      continue;
    }
    if (trimmed.isEmpty) {
      flushParagraph();
      continue;
    }
    if (_opensBlock(trimmed)) {
      flushParagraph();
    }
    paragraph.add(trimmed);
  }

  if (fence.isNotEmpty) {
    blocks.add(fence.join('\n'));
  }
  flushParagraph();

  return blocks.isEmpty ? null : blocks.join('\n\n');
}

/// Strips `///`, `/**`, ` * ` and `*/`, plus the single space dartdoc puts
/// after the marker. Returns null for a line that is only a delimiter.
String? _stripDelimiters(String raw) {
  var line = raw.trimLeft();
  if (line.startsWith('///')) {
    line = line.substring(3);
  } else if (line.startsWith('/**')) {
    line = line.substring(3);
  } else if (line.startsWith('*/')) {
    return null;
  } else if (line.startsWith('*')) {
    line = line.substring(1);
  }
  if (line.endsWith('*/')) {
    line = line.substring(0, line.length - 2);
  }
  if (line.startsWith(' ')) {
    line = line.substring(1);
  }
  return line.trimRight();
}

bool _opensBlock(String trimmed) {
  return trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('+ ') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('> ') ||
      RegExp(r'^\d+[.)]\s').hasMatch(trimmed);
}

Directory? _ancestorContaining(Directory start, String marker) {
  var dir = start.absolute;
  while (true) {
    if (File('${dir.path}${Platform.pathSeparator}$marker').existsSync()) {
      return dir;
    }
    final parent = dir.parent;
    if (parent.path == dir.path) {
      return null;
    }
    dir = parent;
  }
}

/// Resolves against the working directory and normalises away any `..`, which
/// [AnalysisContextCollection] rejects.
String _resolve(String path) {
  final resolved = Uri.base.resolve(path).normalizePath().toFilePath();
  if (resolved.length > 1 && resolved.endsWith(Platform.pathSeparator)) {
    return resolved.substring(0, resolved.length - 1);
  }
  return resolved;
}

String _posix(String path) => path.replaceAll(r'\', '/');

String _relativeTo(String path, String base) {
  final prefix = base.endsWith(Platform.pathSeparator)
      ? base
      : '$base${Platform.pathSeparator}';
  return path.startsWith(prefix) ? path.substring(prefix.length) : path;
}

String _basename(String posixPath) {
  final index = posixPath.lastIndexOf('/');
  return index == -1 ? posixPath : posixPath.substring(index + 1);
}
