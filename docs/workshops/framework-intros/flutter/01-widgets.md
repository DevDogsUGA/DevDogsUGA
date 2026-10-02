---
name: "Widgets"
description: "Everything on screen is a widget. Meet the key ones, and give the home screen its own file."
order: 1
checkpoint: "01-flutter-intro/01-widgets"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-flutter-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Widgets

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=01-flutter-intro%2F01-widgets&from=01-flutter-intro%2F00-start)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](/docs/workshops/getting-started/prerequisites#git-and-a-github-account).

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 01-flutter-intro/00-start
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/01-flutter-intro 01-flutter-intro/00-start
```

</details>

</div>

In Flutter, everything on screen is a widget: text, buttons, padding, whole screens. Widgets nest inside each other to make a tree, and your app is the widget at its root.

## Some Key Widgets

| Widget                                 | What it does                                                |
| -------------------------------------- | ----------------------------------------------------------- |
| `Scaffold`                             | The base for every screen you write: app bar, body, bottom bar. |
| `Text`                                 | Shows a string.                                             |
| Buttons (`ElevatedButton`, `TextButton`) | Run code when they're tapped.                             |
| `Row`                                  | Arranges its children side by side.                         |
| `Column`                               | Stacks its children top to bottom.                          |
| `Card`                                 | A raised panel, for grouping content into clean layers.     |

## The Home Screen, in Its Own File

Make `lib/homepage.dart` for the home screen, so `main.dart` doesn't grow with every screen you add. It comes in two parts here: put them one after the other. `HomePage` is a `StatefulWidget`: the widget itself is small, and `createState` hands it a `State` object to keep.

```dart file=lib/homepage.dart lines=1-8 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/87abfe6b0226d13d96e4635e24579181396ce47f/lib/homepage.dart#L1-L8 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F01-widgets&file=lib%2Fhomepage.dart&lines=1-8
import 'package:flutter/material.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}
```

The `State` holds anything that can change, and has the `build` method, which returns the widgets to draw: a `Scaffold`, with the text centered in its body. Nothing changes on this screen yet. The guestbook in step 3 is where state earns its keep.

```dart file=lib/homepage.dart lines=10-22 href=https://github.com/DevDogsUGA/Mobile-Workshops/blob/87abfe6b0226d13d96e4635e24579181396ce47f/lib/homepage.dart#L10-L22 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FMobile-Workshops&ref=01-flutter-intro%2F01-widgets&file=lib%2Fhomepage.dart&lines=10-22
class _HomePageState extends State<HomePage> {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text(
          'Hello, World!',
          style: TextStyle(fontSize: 48, color: Colors.teal),
        ),
      ),
    );
  }
}
```

[The whole `lib/homepage.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/87abfe6b0226d13d96e4635e24579181396ce47f/lib/homepage.dart)

## Import It in main.dart

`main()` runs the app. `MyApp` sets its title and theme, and `home` is the first screen. Delete the old `HomePage` class from the bottom of this file, and add the import of the new one as the first line. <details>
<summary>What is <code>package:flutter_workshop/</code>?</summary>

This app's own `lib` folder: `flutter_workshop` is the name in `pubspec.yaml`. </details>

```diff file=lib/main.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/899d081e2d2b529508b3e74c0432cf081690590e...87abfe6b0226d13d96e4635e24579181396ce47f#diff-e61eb31d013d12616f5532636a88cfa63631dda8f7829e5424e68542214d1608 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=01-flutter-intro%2F01-widgets&from=01-flutter-intro%2F00-start&file=lib%2Fmain.dart
--- a/lib/main.dart
+++ b/lib/main.dart
@@ -1,36 +1,22 @@
+import 'package:flutter_workshop/homepage.dart';
 import 'package:flutter/material.dart';

 void main() {
   runApp(const MyApp());
 }

 class MyApp extends StatelessWidget {
   const MyApp({super.key});

+  // This widget is the root of your application.
   @override
   Widget build(BuildContext context) {
     return MaterialApp(
       title: 'DevDogs Workshop',
       theme: ThemeData(
         colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
       ),
       home: const HomePage(),
     );
   }
 }
-
-class HomePage extends StatelessWidget {
-  const HomePage({super.key});
-
-  @override
-  Widget build(BuildContext context) {
-    return const Scaffold(
-      body: Center(
-        child: Text(
-          'Hello, World!',
-          style: TextStyle(fontSize: 48, color: Colors.teal),
-        ),
-      ),
-    );
-  }
-}
```

[The whole `lib/main.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/87abfe6b0226d13d96e4635e24579181396ce47f/lib/main.dart)

## Stateless or Stateful

**Stateless**, like `MyApp`:

- Draws from its inputs alone
- Draws the same thing until its parent hands it something new

**Stateful: it keeps state**

- Keeps a `State` object between draws
- Calling `setState` changes it, and Flutter calls `build` again to redraw

## Your Turn: Try Some Widgets

In `homepage.dart`, wrap the `Text` in a `Column`, add a second `Text` under it, and put the whole thing in a `Card`. Save, and press `r` in the terminal running the app: the change appears without restarting.

> [!WARNING]
> This one's for practice, with no checkpoint. Undo it before step 2 (**Ctrl+Z**, or **Cmd+Z** on macOS, in the editor), so your code matches ours.

<!-- prettier-ignore-end -->
