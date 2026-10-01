---
name: "Navigation"
description: "Add a bar along the bottom that switches between two screens."
order: 2
checkpoint: "01-flutter-intro/02-navigation"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-flutter-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Navigation

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=01-flutter-intro%2F02-navigation&from=01-flutter-intro%2F01-widgets)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-flutter-intro/01-widgets
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-flutter-intro 01-flutter-intro/01-widgets
```

</details>

</div>

Most apps have more than one screen. This step adds a bar along the bottom with two tabs: Home, and a Guestbook tab you'll fill in during step 3.

## A Shell for the Tabs

Make `lib/shell.dart`. `Shell` holds the app's screens and switches between them. It's Stateful, because which tab is selected changes.

```dart file=lib/shell.dart lines=1-12 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/ae1f1f1d077e7e07621dae06f667b52ca69025f7/lib/shell.dart#L1-L12 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F02-navigation&file=lib%2Fshell.dart&lines=1-12
import 'package:flutter/material.dart';

import 'package:flutter_workshop/homepage.dart';

/// Wraps HomePage and Guestbook in a bottom NavigationBar so you can switch
/// between the two screens.
class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}
```

`_selectedIndex` is the selected tab. `_pages` has a screen for each tab: `HomePage`, then a placeholder `Text` until the guestbook exists.

```dart file=lib/shell.dart lines=14-17 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/ae1f1f1d077e7e07621dae06f667b52ca69025f7/lib/shell.dart#L14-L17 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F02-navigation&file=lib%2Fshell.dart&lines=14-17
class _ShellState extends State<Shell> {
  int _selectedIndex = 0;

  static const _pages = [HomePage(), Center(child: Text('Guestbook'))];
```

`Scaffold` has a slot for a bar along the bottom. `NavigationBar` shows one `NavigationDestination` per tab. Tapping one calls `onDestinationSelected`, and `setState` stores the new index, so `build` runs again and the body shows that tab's page.

```dart file=lib/shell.dart lines=19-33 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/ae1f1f1d077e7e07621dae06f667b52ca69025f7/lib/shell.dart#L19-L33 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F02-navigation&file=lib%2Fshell.dart&lines=19-33
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

[The whole `lib/shell.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/ae1f1f1d077e7e07621dae06f667b52ca69025f7/lib/shell.dart)

## Open on the Shell

`home` becomes `Shell()`, so the app opens on the tabs.

```diff file=lib/main.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/87abfe6b0226d13d96e4635e24579181396ce47f...ae1f1f1d077e7e07621dae06f667b52ca69025f7#diff-e61eb31d013d12616f5532636a88cfa63631dda8f7829e5424e68542214d1608 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=01-flutter-intro%2F02-navigation&from=01-flutter-intro%2F01-widgets&file=lib%2Fmain.dart
--- a/lib/main.dart
+++ b/lib/main.dart
@@ -1,22 +1,22 @@
-import 'package:flutter_workshop/homepage.dart';
+import 'package:flutter_workshop/shell.dart';
 import 'package:flutter/material.dart';

 void main() {
   runApp(const MyApp());
 }

 class MyApp extends StatelessWidget {
   const MyApp({super.key});

   // This widget is the root of your application.
   @override
   Widget build(BuildContext context) {
     return MaterialApp(
       title: 'DevDogs Workshop',
       theme: ThemeData(
         colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
       ),
-      home: const HomePage(),
+      home: const Shell(),
     );
   }
 }
```

[The whole `lib/main.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/ae1f1f1d077e7e07621dae06f667b52ca69025f7/lib/main.dart)

## Try It

Press `R` in the terminal running the app for a hot restart, since the first screen changed. Tap between Home and Guestbook.

<!-- prettier-ignore-end -->
