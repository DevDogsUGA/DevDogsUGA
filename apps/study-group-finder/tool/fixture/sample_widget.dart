// Not application code. `lib/` currently holds one placeholder widget, which
// exercises maybe a third of `tool/docs_extract.dart`; this file stands in for
// the app the extractor will eventually have to describe, so a regression in
// enum, extension, default-value or transitive-supertype handling surfaces now
// rather than on the commit that first writes real screens. Point the tool at
// it with `dart run tool/docs_extract.dart --lib tool/fixture`.

import 'package:flutter/material.dart';

/// The largest group the matcher will assemble.
const int maxGroupSize = 8;

/// Where a study session sits in its lifecycle.
///
/// Ordered by time, so comparing indices answers "has this already happened".
enum SessionStatus { scheduled, active, ended }

/// Renders [status] for a chip or a list subtitle.
///
/// Pass `short: true` where the column is narrow — the abbreviation is not
/// localized, so it is only safe in space-constrained chrome.
String formatSessionLabel(SessionStatus status, {bool short = false}) {
  return switch (status) {
    SessionStatus.scheduled => short ? 'Soon' : 'Scheduled',
    SessionStatus.active => short ? 'Live' : 'Meeting now',
    SessionStatus.ended => short ? 'Done' : 'Ended',
  };
}

/// Adds presentation concerns to [SessionStatus] without widening the enum,
/// which the Supabase-generated models also construct.
extension SessionStatusPalette on SessionStatus {
  /// The accent color a session in this state should be tinted with.
  Color get accent => switch (this) {
        SessionStatus.scheduled => Colors.blueGrey,
        SessionStatus.active => Colors.green,
        SessionStatus.ended => Colors.grey,
      };
}

/// A single study group in a list.
class SampleCard extends StatelessWidget {
  /// Creates a card for the group named [title].
  const SampleCard({
    required this.title,
    required this.onTap,
    this.subtitle,
    this.maxLines = 2,
    this.dense = false,
    super.key,
  });

  /// The group's display name.
  final String title;

  /// Course code and meeting time, when the group has published one.
  final String? subtitle;

  /// How many lines [subtitle] may wrap to before it is ellipsized.
  final int maxLines;

  /// Tightens the vertical padding, for cards inside a scrolling sheet.
  final bool dense;

  /// Invoked when the card is tapped.
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: dense,
      title: Text(title),
      subtitle: subtitle == null
          ? null
          : Text(subtitle!,
              maxLines: maxLines, overflow: TextOverflow.ellipsis),
      onTap: onTap,
    );
  }
}

/// Reaches `StatelessWidget` only through [SampleCard], so classifying this as
/// a widget requires walking the whole supertype chain rather than the one
/// `extends` clause.
class CompactSampleCard extends SampleCard {
  /// Creates a one-line variant of [SampleCard].
  const CompactSampleCard(
      {required super.title, required super.onTap, super.key})
      : super(dense: true, maxLines: 1);
}

/// Tracks how many members have opted in, so the extractor sees a
/// `StatefulWidget` and the private `State` subclass it is paired with.
class SampleCounter extends StatefulWidget {
  /// Creates a counter starting from [initial].
  const SampleCounter({this.initial = 0, super.key});

  /// The count to start from.
  final int initial;

  @override
  State<SampleCounter> createState() => _SampleCounterState();
}

class _SampleCounterState extends State<SampleCounter> {
  late int _count = widget.initial;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => setState(() => _count++),
      child: Text('$_count'),
    );
  }
}

class PlainModel {
  const PlainModel(this.id, [this.label = 'untitled']);

  final String id;
  final String label;
}
