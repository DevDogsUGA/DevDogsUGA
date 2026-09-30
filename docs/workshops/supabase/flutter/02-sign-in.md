---
name: "Sign In with OAuth"
description: "Register the app with DevDogs, add it as an OIDC provider in Supabase, and add sign-in and sign-out."
order: 2
checkpoint: "02-supabase/02-sign-in"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Sign In with OAuth

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/01-read
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/01-read
```

</details>

</div>

**OIDC** (OpenID Connect) is a standard built on OAuth 2.0. It lets your app send people to another service to sign in (here, DevDogs), then tells your app who they are.

## Register Your App with DevDogs

1. Go to **devdogsuga.org/tools/oauth** and create a client
1. Redirect URI: your **Project URL** + `/auth/v1/callback`
   - For example, `https://abcdefghij.supabase.co/auth/v1/callback`
1. Copy the **client ID** and **client secret**

## Add the Provider in Supabase

1. Authentication → **Sign In / Providers** → Add a Custom **OIDC** Provider
1. Fill it in, save, and check that it's enabled:

   :::copyable

   | Setting       | Value                                                                       |
   | ------------- | --------------------------------------------------------------------------- |
   | Identifier    | `custom:devdogsuga`                                                         |
   | Name          | `DevDogs`                                                                   |
   | Issuer URL    | `https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1`                          |
   | Client ID     | [Copy from your OAuth page](https://devdogsuga.org/tools/oauth#credentials) |
   | Client Secret | [Copy from your OAuth page](https://devdogsuga.org/tools/oauth#credentials) |
   | Scopes        | `openid email profile`                                                      |

   :::

## Sign In / Sign Out

Signing in only needs the client we already have: it's all under `_supabase.auth`.

`kIsWeb` says whether we're in a browser: come back to this page on the web, or to the app's deep link on a phone.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/7fd7904f48cb294ede0ea901345dabc44cdff2af...2602d3aed596335ac990eb003f8e08af7fdb10c7#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,77 +1,84 @@
+import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

+/// Where the OAuth provider should send the browser (web) or the app
+/// (mobile) back to once sign-in finishes. The scheme below is already
+/// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
+String get _redirectTo =>
+    kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';
+
 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
     _loadMessages();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   return ListTile(
                     title: Text(message['author_name'] as String),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`Session?`: the `?` means it can be `null`, i.e. signed out.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/7fd7904f48cb294ede0ea901345dabc44cdff2af...2602d3aed596335ac990eb003f8e08af7fdb10c7#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,84 +1,85 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
+  Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
     _loadMessages();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   return ListTile(
                     title: Text(message['author_name'] as String),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`onAuthStateChange` is a `Stream`. `listen` runs on every sign-in and sign-out, and `setState` redraws.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/7fd7904f48cb294ede0ea901345dabc44cdff2af...2602d3aed596335ac990eb003f8e08af7fdb10c7#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,85 +1,92 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
+
+    // Keep track of whether anyone is signed in, and react to sign-in/out.
+    _session = _supabase.auth.currentSession;
+    _supabase.auth.onAuthStateChange.listen((data) {
+      setState(() => _session = data.session);
+    });
+
     _loadMessages();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   return ListTile(
                     title: Text(message['author_name'] as String),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`OAuthProvider('custom:devdogsuga')` is our custom provider, and `=>` is shorthand for a one-line function.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/7fd7904f48cb294ede0ea901345dabc44cdff2af...2602d3aed596335ac990eb003f8e08af7fdb10c7#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,92 +1,101 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();

     // Keep track of whether anyone is signed in, and react to sign-in/out.
     _session = _supabase.auth.currentSession;
     _supabase.auth.onAuthStateChange.listen((data) {
       setState(() => _session = data.session);
     });

     _loadMessages();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

+  Future<void> _signIn() {
+    return _supabase.auth.signInWithOAuth(
+      OAuthProvider('custom:devdogsuga'),
+      redirectTo: _redirectTo,
+    );
+  }
+
+  Future<void> _signOut() => _supabase.auth.signOut();
+
   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   return ListTile(
                     title: Text(message['author_name'] as String),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`build` copies `_session` into a local, so Dart knows it can't change halfway through.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/7fd7904f48cb294ede0ea901345dabc44cdff2af...2602d3aed596335ac990eb003f8e08af7fdb10c7#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,101 +1,103 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();

     // Keep track of whether anyone is signed in, and react to sign-in/out.
     _session = _supabase.auth.currentSession;
     _supabase.auth.onAuthStateChange.listen((data) {
       setState(() => _session = data.session);
     });

     _loadMessages();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   Future<void> _signIn() {
     return _supabase.auth.signInWithOAuth(
       OAuthProvider('custom:devdogsuga'),
       redirectTo: _redirectTo,
     );
   }

   Future<void> _signOut() => _supabase.auth.signOut();

   @override
   Widget build(BuildContext context) {
+    final session = _session;
+
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   return ListTile(
                     title: Text(message['author_name'] as String),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`session == null ? … : …` picks which button to show.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/7fd7904f48cb294ede0ea901345dabc44cdff2af...2602d3aed596335ac990eb003f8e08af7fdb10c7#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,103 +1,116 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();

     // Keep track of whether anyone is signed in, and react to sign-in/out.
     _session = _supabase.auth.currentSession;
     _supabase.auth.onAuthStateChange.listen((data) {
       setState(() => _session = data.session);
     });

     _loadMessages();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   Future<void> _signIn() {
     return _supabase.auth.signInWithOAuth(
       OAuthProvider('custom:devdogsuga'),
       redirectTo: _redirectTo,
     );
   }

   Future<void> _signOut() => _supabase.auth.signOut();

   @override
   Widget build(BuildContext context) {
     final session = _session;

     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
-            const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
+            Align(
+              alignment: Alignment.centerLeft,
+              child: session == null
+                  ? ElevatedButton(
+                      onPressed: _signIn,
+                      child: const Text('Sign in with DevDogs'),
+                    )
+                  : OutlinedButton(
+                      onPressed: _signOut,
+                      child: const Text('Sign out'),
+                    ),
+            ),
+            const SizedBox(height: 8),
+            const Text('Anyone can read the guestbook below. Posting is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   return ListTile(
                     title: Text(message['author_name'] as String),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/2602d3aed596335ac990eb003f8e08af7fdb10c7/lib/guestbook.dart)

<!-- prettier-ignore-end -->
