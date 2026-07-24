import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Supabase config is injected at build/run time via --dart-define (sourced
/// from the shared root .env by the package.json scripts). AUTH_MODE selects
/// the sign-in provider: "devdogs" (platform OAuth server, dev) or "google"
/// (production).
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabasePublishableKey =
    String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
const authMode = String.fromEnvironment('AUTH_MODE', defaultValue: 'devdogs');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: supabaseUrl,
    publishableKey: supabasePublishableKey,
    postgrestOptions: const PostgrestClientOptions(schema: 'study_group_finder'),
  );
  runApp(const StudyGroupFinderApp());
}

/// Placeholder application. Replace the home screen as the app is built out.
class StudyGroupFinderApp extends StatelessWidget {
  const StudyGroupFinderApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DevDogs Study Group Finder',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFFBA0C2F),
        useMaterial3: true,
      ),
      home: const Scaffold(
        body: Center(child: Text('DevDogs Study Group Finder')),
      ),
    );
  }
}
