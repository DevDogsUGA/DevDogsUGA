import 'package:devdogsuga_sdk/devdogsuga_sdk.dart';
import 'package:material_ui/material_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Run with `flutter run --dart-define-from-file=.env`.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final env = DevDogsEnv.fromDefines()
    ..requireAll([
      DevDogsEnvKeys.supabaseUrl,
      DevDogsEnvKeys.supabasePublishableKey,
      DevDogsEnvKeys.catalogUrl,
    ]);

  await initTelemetry(
    dsn: env.sentryDsn,
    environment: env.environment,
    service: 'example',
    appRunner: () async {
      await Supabase.initialize(
        url: env.supabaseUrl,
        publishableKey: env.supabasePublishableKey,
      );
      runApp(ExampleApp(env: env));
    },
  );
}

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key, required this.env});

  final DevDogsEnv env;

  @override
  Widget build(BuildContext context) {
    final auth = DevDogsAuth(Supabase.instance.client.auth);
    final catalog = CatalogClient(baseUrl: env.catalogUrl, clientName: 'example/0.1');
    return MaterialApp(
      theme: DevDogsTheme.light(app: BrandApps.dogpack),
      darkTheme: DevDogsTheme.dark(app: BrandApps.dogpack),
      home: Scaffold(
        appBar: AppBar(title: Text(BrandApps.dogpack.name)),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FilledButton(
                onPressed: () => auth.signIn(redirectTo: 'dev.example://login-callback'),
                child: const Text('Sign In'),
              ),
              const SizedBox(height: 16),
              FutureBuilder(
                future: catalog.listTerms(),
                builder: (context, snapshot) => Text(
                  snapshot.hasData
                      ? '${snapshot.data!.terms.length} terms'
                      : 'Loading terms...',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
