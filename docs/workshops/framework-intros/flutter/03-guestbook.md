---
name: "Guestbook"
description: "Fill the second tab with a guestbook. Text fields, a list, and state that changes."
order: 3
checkpoint: "01-flutter-intro/03-guestbook"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-flutter-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Guestbook

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=01-flutter-intro%2F03-guestbook&from=01-flutter-intro%2F02-navigation)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](../../../_shared/getting-started/prerequisites.md#git-and-a-github-account).

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-flutter-intro/02-navigation
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-flutter-intro 01-flutter-intro/02-navigation
```

</details>

</div>

A guestbook uses everything so far: a Stateful widget, a `Scaffold`, and the tab from step 2. This time the state is a list that grows.

## The Guestbook Screen

> [!TIP]
> The file is long, so it comes in five parts: put them one after another, in order, or copy the whole file from the link after the last part.

Make `lib/guestbook.dart`. `GuestbookEntry` is plain Dart: one entry's name, message and time. `required` means every entry has all three.

```dart file=lib/guestbook.dart lines=1-10 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/guestbook.dart#L1-L10 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F03-guestbook&file=lib%2Fguestbook.dart&lines=1-10
import 'package:flutter/material.dart';

/// One guestbook entry: who left it, what it says, and when.
class GuestbookEntry {
  GuestbookEntry({required this.name, required this.message, required this.time});

  final String name;
  final String message;
  final DateTime time;
}
```

`Guestbook` is Stateful. Its `State` keeps a `TextEditingController` per field, which reads and clears what's typed, and the list of entries. Controllers hold on to resources, so `dispose` releases them when the screen goes away.

```dart file=lib/guestbook.dart lines=15-35 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/guestbook.dart#L15-L35 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F03-guestbook&file=lib%2Fguestbook.dart&lines=15-35
class Guestbook extends StatefulWidget {
  const Guestbook({super.key});

  @override
  State<Guestbook> createState() => _GuestbookState();
}

class _GuestbookState extends State<Guestbook> {
  final _nameController = TextEditingController();
  final _messageController = TextEditingController();

  // Newest entries are added to the front of the list, so the list itself is
  // always in "newest first" order.
  final List<GuestbookEntry> _entries = [];

  @override
  void dispose() {
    _nameController.dispose();
    _messageController.dispose();
    super.dispose();
  }
```

`_submit` trims both fields and turns away an entry with an empty one. Inside `setState`, the new entry goes in at index 0, so the newest shows first, and the fields clear. `setState` is what tells Flutter to rebuild with the new list.

```dart file=lib/guestbook.dart lines=37-54 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/guestbook.dart#L37-L54 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F03-guestbook&file=lib%2Fguestbook.dart&lines=37-54
  void _submit() {
    final name = _nameController.text.trim();
    final message = _messageController.text.trim();

    // Reject the entry if either field is empty once whitespace is trimmed.
    if (name.isEmpty || message.isEmpty) {
      return;
    }

    setState(() {
      _entries.insert(
        0,
        GuestbookEntry(name: name, message: message, time: DateTime.now()),
      );
      _nameController.clear();
      _messageController.clear();
    });
  }
```

The screen is a `Column`: two `TextField`s, a button that calls `_submit`, and the list. `ListView.builder` only builds the rows on screen, which matters once a list gets long. `Expanded` gives it whatever height the column has left.

```dart file=lib/guestbook.dart lines=56-94 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/guestbook.dart#L56-L94 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F03-guestbook&file=lib%2Fguestbook.dart&lines=56-94
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Guestbook')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _messageController,
              decoration: const InputDecoration(labelText: 'Message'),
            ),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _submit, child: const Text('Sign the guestbook')),
            const Divider(height: 32),
            Expanded(
              child: ListView.builder(
                itemCount: _entries.length,
                itemBuilder: (context, index) {
                  final entry = _entries[index];
                  return ListTile(
                    title: Text(entry.name),
                    subtitle: Text(entry.message),
                    trailing: Text(_formatTime(entry.time)),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

`_formatTime` turns a time into `HH:MM` for each entry.

```dart file=lib/guestbook.dart lines=96-101 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/guestbook.dart#L96-L101 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F03-guestbook&file=lib%2Fguestbook.dart&lines=96-101
/// Formats a time as HH:MM, zero-padded, for display next to an entry.
String _formatTime(DateTime time) {
  final hour = time.hour.toString().padLeft(2, '0');
  final minute = time.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/guestbook.dart)

## Put It in the Tab

The placeholder becomes the real `Guestbook`, imported at the top.

```diff file=lib/shell.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/ae1f1f1d077e7e07621dae06f667b52ca69025f7...e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1#diff-6411a7fcddf510c22dd44a5704ad7449d2b29e1b06db153820c85f62fc043fcd vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=01-flutter-intro%2F03-guestbook&from=01-flutter-intro%2F02-navigation&file=lib%2Fshell.dart
--- a/lib/shell.dart
+++ b/lib/shell.dart
@@ -1,33 +1,34 @@
 import 'package:flutter/material.dart';

+import 'package:flutter_workshop/guestbook.dart';
 import 'package:flutter_workshop/homepage.dart';

 /// Wraps HomePage and Guestbook in a bottom NavigationBar so you can switch
 /// between the two screens.
 class Shell extends StatefulWidget {
   const Shell({super.key});

   @override
   State<Shell> createState() => _ShellState();
 }

 class _ShellState extends State<Shell> {
   int _selectedIndex = 0;

-  static const _pages = [HomePage(), Center(child: Text('Guestbook'))];
+  static const _pages = [HomePage(), Guestbook()];

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       body: _pages[_selectedIndex],
       bottomNavigationBar: NavigationBar(
         selectedIndex: _selectedIndex,
         onDestinationSelected: (index) => setState(() => _selectedIndex = index),
         destinations: const [
           NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
           NavigationDestination(icon: Icon(Icons.book), label: 'Guestbook'),
         ],
       ),
     );
   }
 }
```

[The whole `lib/shell.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/e0c3c4d79c64d4b46da8c6402727a1fd1b907ec1/lib/shell.dart)

## Restart It

Hot reload, open the Guestbook tab, and sign it a few times. Then press `R` for a hot restart. The entries are gone: they only ever lived in the screen's state, in memory.

> [!NOTE]
> The [Supabase workshop](../../supabase/flutter/setup.md) gives them somewhere to live, starting from exactly this code.

## Keep Going

1. [Flutter's docs](https://docs.flutter.dev), from first app to publishing
1. [The widget catalog](https://docs.flutter.dev/ui/widgets), every built-in widget by category
1. [A tour of Dart](https://dart.dev/language), the language under it all
1. Ready to contribute? Start with DogPack's [Your first contribution](../../../study-group-finder/getting-started/first-contribution.md)

<!-- prettier-ignore-end -->
